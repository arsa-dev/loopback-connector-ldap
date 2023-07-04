var g = require("strong-globalize")();
var Connector = require("loopback-connector").Connector;
var debug = require("debug")("loopback:connector:ldap");
var ldapclient = require("ldapjs");
var util = require("util");
var assert = require("assert-plus");
var db = {};

var utils = require("loopback-datasource-juggler/lib/utils");

/**
 * Initialize the LDAP Connector for the given data source
 * @param {DataSource} dataSource The data source instance
 * @param {Function} [callback] The callback function
 */
exports.initialize = function initializeDataSource(dataSource, callback) {
  if (!ldapclient) {
    return;
  }
  // Add check to settings
  var settings = dataSource.settings;
  dataSource.ldapClient = ldapclient.createClient({
    url: settings.host + ":" + settings.port,
  });
  dataSource.ldapClient.bind(settings.user, settings.password, function (err) {
    if (err) {
      g.error("ldap-connector: " + err.message);
    } else {
      g.log("ldap-connector: LDAP Connexion SUCCESFUL :" + settings.name);
    }
  });

  dataSource.connector = new LDAPConnector(settings, dataSource);
  process.nextTick(function () {
    callback && callback();
  });
};

/**
 * The constructor for LDAP connector
 * @param {Object} settings The settings object
 * @param {DataSource} dataSource The data source instance
 * @constructor
 */
function LDAPConnector(settings, dataSource) {
  Connector.call(this, "ldap", settings);
  this.dataSource = dataSource;
  this.ldapClient = dataSource.ldapClient;
  g.log("ldap-connector: Connector settings :" + settings.name);
}

util.inherits(LDAPConnector, Connector);

LDAPConnector.prototype.connect = function (callback) {
  var self = this;
  g.log("ldap-connector: Binding with the LDAP: " + self.settings.name);
  //TGR Change Request
  //replace line : seld.ldapClient.bind(settings.bindDn, settings.bindPassword, function(err) { by :
  self.ldapClient.bind(self.settings.user, self.settings.password, function (err) {
    if (err) {
      g.error("ldap-connector: " + err.message);
    } else {
      g.log("ldap-connector: LDAP Connexion SUCCESFUL :" + self.settings.name);
    }
  });
  process.nextTick(function () {
    callback && callback();
  });
};

LDAPConnector.prototype.disconnect = function (callback) {
  var self = this;
  self.ldapClient.unbind(function (err) {
    if (err) {
      g.error("ldap-connector: LDAP disconnection FAILED :" + err.message);
    }
  });
  process.nextTick(function () {
    callback && callback();
  });
};

LDAPConnector.prototype.ping = function (callback) {
  g.log("ldap-connector: Calling ping");
};

LDAPConnector.prototype.execute = function (model, command) {
  // ...
};

LDAPConnector.prototype.create = function (model, data, callback) {
  var self = this;
  var modelMapping = self.settings.modelMapping[model]["mapping"];
  if (!modelMapping) {
    g.log("ldap-connector:  Couldn't find a model mapping for " + model.name);
  }
  for (var key in data) {
    if (!modelMapping[key]) {
      entry[modelMapping[key]] = data["key"];
    }
  }
  // TODO : check ig settings.searchBase exists ..
  self.ldapClient.add(self.settings.searchBase, entry, function (err) {
    g.error("ldap-connector: Adding a new entry to LDAP FAILED :" + err.message);
    assert.ifError(err);
  });
};

LDAPConnector.prototype.LDAPtoModel = function (ldapEntry, model) {
  //g.log("ldap-connector:  LDAPtoModel: "+ JSON.stringify(ldapEntry));
  var self = this;
  var modelMapping = self.settings.modelMapping[model]["mapping"];
  if (!modelMapping) {
    g.log("ldap-connector:  Couldn't find a model mapping for " + model.name);
  }
  var modelInstance = {};

  for (var key in modelMapping) {
    if (modelMapping[key] && ldapEntry[modelMapping[key]]) {
      modelInstance[key] = ldapEntry[modelMapping[key]];
    }
  }
  //This is method invoked when getting user from ldap : http://10.96.5.36:3000/api/AppUsers/uid
  return modelInstance;
};

LDAPConnector.prototype.modeltoLDAPFilter = function (filter, model) {
  g.log("ldap-connector: modeltoLDAPFilter :" + JSON.stringify(filter));
  var self = this;
  var modelMapping = self.settings.modelMapping[model]["mapping"];

  if (!modelMapping) {
    g.log("ldap-connector:  Couldn't find a model mapping for " + model.name);
  }
  var ldapInstance = "";

  for (var key in modelMapping) {
    //TGR Change Request
    //implement ldap search with operators : OR,AND,NOT vs loopback search : INQ,OR,AND
    //INQ => | (OR)
    //AND => & (AND)
    //OR => | (OR)
    //implementation of INQ / OR(|) operator : loopback to ldap
    if (filter[key] && filter[key]["inq"]) {
      var list = filter[key]["inq"];
      ldapInstance += "(" + "|";
      list.forEach(function (element) {
        ldapInstance += "(" + modelMapping[key] + "=" + element + ")";
      });
      ldapInstance += ")";
    } else if (filter[key] && filter[key]["or"]) {
      //TODO
    } else if (filter[key] && filter[key]["and"]) {
      //TODO
    } else if (modelMapping[key] && filter[key]) {
      ldapInstance += "(" + modelMapping[key] + "=" + filter[key] + ")";
    }
    //TGR Change Request
    //implement ldap search with operator : like on ldap attribute
    if (filter[key] && filter[key]["like"]) {
      var element = filter[key]["like"].replace("%", "*");
      element = filter[key]["like"].replace(/%/g, "*");
      ldapInstance = modelMapping[key] + "=" + element;
    }
  } //end for(var key

  //TGR Change Request
  //implement ldap search with operator : AND with OR inside on ldap many attributes
  //09/03/2018
  //ex : (&(cn=*TOTO*)(|(title=*CHEF*)(title=*DIR*)(title=*PERCEPTEUR*)(title=*TRESORIER*)))

  if (filter["and"]) {
    var cpt1 = 0;
    ldapInstance = "(" + "&";
    filter["and"].forEach(function (andElement) {
      var andElementKey = null;
      for (var key in modelMapping) {
        if (andElement[key]) {
          if (andElement[key]["like"]) {
            //DO THE BESIDE TREATEMENT
            var element = andElement[key]["like"].replace("%", "*");
            element = andElement[key]["like"].replace(/%/g, "*");
            andElementKey = "(" + modelMapping[key] + "=" + element + ")";
            ldapInstance += "(" + modelMapping[key] + "=" + element + ")";
          }
        }
      } //end for(var key

      if (andElement["or"]) {
        ldapInstance += "(" + "|";
        andElement["or"].forEach(function (orElement) {
          cpt1++;
          for (var key in modelMapping) {
            if (orElement[key]) {
              var element = orElement[key]["like"].replace("%", "*");
              element = orElement[key]["like"].replace(/%/g, "*");
              ldapInstance += "(" + modelMapping[key] + "=" + element + ")";
              if (cpt1 === andElement["or"].length) {
                ldapInstance += "))";
              }
            }
          }
        });
      } //end if if (andElement['or']
    });
    //ldapInstance+=")";
  } //end if (filter['and'])
  //End TGR CR 09/03/2018

  //console.debug('====================ldapInstance  ======================'+ldapInstance);

  return ldapInstance;
};

LDAPConnector.prototype.count = function (model, where, options, callback) {
  g.log("ldap-connector: count :" + JSON.stringify(where));
  var self = this;
  // Building filter
  var searchFilter = {};
  if (where) {
    searchFilter = self.modeltoLDAPFilter(where, model);
  } else {
    searchFilter = self.settings.searchBaseFilter;
  }
  //TGR Change Request
  //IBM Tivoli LDAP
  //get members of a group
  /*if (searchFilter.indexOf('uniquemember',0) != -1){
      searchFilter = searchFilter.substring(0,searchFilter.length-2);
      searchFilter = searchFilter + '*)';
    }*/

  var opts = {
    filter: searchFilter,
    scope: "sub",
    attributes: self.settings.modelMapping.id,
  };

  self.ldapClient.search(self.settings.searchBase, opts, function (err, res) {
    var queryResult = [];

    res.on("searchEntry", function (entry) {
      queryResult.push(self.LDAPtoModel(entry.object, model));
    });

    res.on("searchReference", function (referral) {
      g.log("ldap-connector: referral: " + referral.uris.join());
    });

    res.on("error", function (err) {
      g.error("ldap-connector: error: " + err.message);
      callback(null, err);
    });

    res.on("end", function (result) {
      g.log("ldap-connector: status: " + result.status);
      callback(null, queryResult.length);
    });
  });
};

LDAPConnector.prototype.modeltoLDAPEntry = function (data, model) {
  var self = this;
  var reverseModelMapping = self.settings.modelMapping[model]["reverseMapping"];
  if (!reverseModelMapping) {
    g.log("ldap-connector:  Couldn't find a reverse model mapping for " + model.name);
  }
  var ldapEntry = {};
  for (var key in reverseModelMapping) {
    if (reverseModelMapping[key] && data[reverseModelMapping[key]]) {
      ldapEntry[key] = data[reverseModelMapping[key]];
    }
  }
  var cn = ldapEntry["cn"];

  ldapEntry["objectclass"] = self.settings.modelMapping[model]["objectclass"];
  ldapEntry["cn"] = "";
  for (var i = 0; i < self.settings.modelMapping[model]["cn"].length; i++) {
    ldapEntry["cn"] += data[self.settings.modelMapping[model]["cn"][i]] + " ";
  }
  if (ldapEntry["cn"] === "undefined ") {
    ldapEntry["cn"] = cn;
  }
  return ldapEntry;
};

LDAPConnector.prototype.create = function (model, data, callback) {
  g.log("ldap-connector: create :" + JSON.stringify(data));

  var self = this;
  var ldapEntry = this.modeltoLDAPEntry(data, model);

  //allow custom dn (custom branch) from end user request, but can't post json request with attribute dn : ObjectclassViolationError
  if (ldapEntry["dn"]) {
    var dn = ldapEntry["dn"];
    delete data.dn;
    ldapEntry = this.modeltoLDAPEntry(data, model);
  }

  //delete duplicated userPassword;binary added by ldapjs/loopback
  var entry = ldapEntry;
  if (ldapEntry["userPassword;binary"]) {
    delete entry["userPassword;binary"];
    ldapEntry = entry;
  }
  //Pb userPassword dupplication
  //group creation
  if (ldapEntry["objectclass"][0] == "groupOfUniqueNames") {
    ldapEntry["cn"] = ldapEntry["cn"].split(" ")[0];
    dn = "cn=" + ldapEntry["cn"] + "," + self.settings.searchBase;
  }
  g.log("ldap-connector:  ", JSON.stringify(ldapEntry));
  g.log("ldap-connector:  ", dn);

  self.ldapClient.add(dn, ldapEntry, function (err) {
    if (err) {
      g.error("ldap-connector: Could Not add new Entry :" + err.message);
      callback(err, null);
    } else {
      self.ldapClient.search(dn, { scope: "sub" }, function (err, res) {
        var newEntry = [];

        res.on("searchEntry", function (entry) {
          newEntry = self.LDAPtoModel(entry.object, model);
        });
        res.on("searchReference", function (referral) {
          g.log("ldap-connector: referral: " + referral.uris.join());
        });
        res.on("error", function (err) {
          g.error("ldap-connector: error :" + err.message);
          callback(null, err);
        });
        res.on("end", function (result) {
          g.log("ldap-connector: status: " + result.status);
          callback(null, newEntry.id);
        });
      });
    }
  });
};

//TGR Change Request
//implement update method : update user/group attributes
LDAPConnector.prototype.update = function (model, where, data, callback) {
  g.log("ldap-connector: update :" + JSON.stringify(data));
  g.log("ldap-connector: where :" + JSON.stringify(where));

  //************************

  var ldapEntry = this.modeltoLDAPEntry(data, model);
  var self = this;
  //changePassword
  searchFilter = "(uid=" + where.username + ")";
  var requiredAttributes = ["dn"];

  var opts = {
    filter: searchFilter,
    scope: "sub",
    attributes: requiredAttributes,
  };
  self.ldapClient.search(self.settings.searchBase, opts, function (err, res) {
    var queryResult = [];

    res.on("searchEntry", function (entry) {
      queryResult.push(self.LDAPtoModel(entry.object, model));
    });
    res.on("searchReference", function (referral) {
      g.log("ldap-connector: referral: " + referral.uris.join());
    });
    res.on("error", function (err) {
      g.error("ldap-connector: error :" + err.message);
      callback(null, err);
    });
    res.on("end", function (result) {
      //var dn = 'uid=' + data + ',' + 'ou=adherents,' + self.settings.searchBase;
      var dn = queryResult[0].dn;
      var attributes = {};
      var changes = [];

      if (ldapEntry.password) changes.push(new ldapclient.Change({ operation: "replace", modification: { userPassword: ldapEntry.password } }));
      if (ldapEntry.lastName) changes.push(new ldapclient.Change({ operation: "replace", modification: { givenname: ldapEntry.lastName } }));
      if (ldapEntry.firstName) changes.push(new ldapclient.Change({ operation: "replace", modification: { sn: ldapEntry.firstName } }));
      if (ldapEntry.codecontribuable)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codecontribuable: ldapEntry.codecontribuable } }));
      if (ldapEntry.jpegphoto) changes.push(new ldapclient.Change({ operation: "replace", modification: { jpegphoto: ldapEntry.jpegphoto } }));
      if (ldapEntry.codeordonnateur)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codeordonnateur: ldapEntry.codeordonnateur } }));
      if (ldapEntry.codecomptablepayeur)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codecomptablepayeur: ldapEntry.codecomptablepayeur } }));

      if (ldapEntry.postaladdress) changes.push(new ldapclient.Change({ operation: "replace", modification: { postaladdress: ldapEntry.postaladdress } }));

      if (ldapEntry.title) changes.push(new ldapclient.Change({ operation: "replace", modification: { title: ldapEntry.title } }));
      if (ldapEntry.cin) changes.push(new ldapclient.Change({ operation: "replace", modification: { cin: ldapEntry.cin } }));
      if (ldapEntry.userOU) changes.push(new ldapclient.Change({ operation: "replace", modification: { userOU: ldapEntry.userOU } }));
      if (ldapEntry.userRAT) changes.push(new ldapclient.Change({ operation: "replace", modification: { userRAT: ldapEntry.userRAT } }));
      if (ldapEntry.mobile) changes.push(new ldapclient.Change({ operation: "replace", modification: { mobile: ldapEntry.mobile } }));
      if (ldapEntry.cn) changes.push(new ldapclient.Change({ operation: "replace", modification: { cn: ldapEntry.cn } }));
      if (ldapEntry.codeadministration)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codeadministration: ldapEntry.codeadministration } }));
      if (ldapEntry.codeservice) changes.push(new ldapclient.Change({ operation: "replace", modification: { codeservice: ldapEntry.codeservice } }));
      if (ldapEntry.sexe) changes.push(new ldapclient.Change({ operation: "replace", modification: { sexe: ldapEntry.sexe } }));
      if (ldapEntry.commentaires) changes.push(new ldapclient.Change({ operation: "replace", modification: { commentaires: ldapEntry.commentaires } }));
      if (ldapEntry.titlecode) changes.push(new ldapclient.Change({ operation: "replace", modification: { titlecode: ldapEntry.titlecode } }));
      if (ldapEntry.titlehierarchy) changes.push(new ldapclient.Change({ operation: "replace", modification: { titlehierarchy: ldapEntry.titlehierarchy } }));
      if (ldapEntry.employeenumber) changes.push(new ldapclient.Change({ operation: "replace", modification: { employeenumber: ldapEntry.employeenumber } }));
      if (ldapEntry.uidagtsaisie) changes.push(new ldapclient.Change({ operation: "replace", modification: { uidagtsaisie: ldapEntry.uidagtsaisie } }));
      if (ldapEntry.preferredlanguage)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { preferredlanguage: ldapEntry.preferredlanguage } }));
      if (ldapEntry.fixe) changes.push(new ldapclient.Change({ operation: "replace", modification: { fixe: ldapEntry.telephonenumber } }));
      if (ldapEntry.dn) changes.push(new ldapclient.Change({ operation: "replace", modification: { dn: ldapEntry.dn } }));

      if (!changes) {
        callback("changes required.", null);
        return;
      }
      if (!dn) {
        callback("No such dn.", null);
        return;
      }

      self.ldapClient.modify(dn, changes, function (err) {
        assert.ifError(err);
        if (err) {
          g.error("ldap-connector: Could Not replace :" + err.message);
          callback(err, null);
        } else {
          g.log("ldap-connector: Changes Successful.");
          callback(null, "Change Successful.");
        }
      });
    });
  });

  //*************************
};

//TGR Change Request
//implement update method : update group attributes
LDAPConnector.prototype.updateAll = function (model, where, data, callback) {
  g.log("ldap-connector: updateAll :" + JSON.stringify(data));
  //console.log('model='+JSON.stringify(model));
  //console.log('where='+JSON.stringify(where));
  //console.log('data='+JSON.stringify(data));
  //console.log(ldapEntry);
  //@TODO ...
  callback(null, "Not yet implemented");
};

//TGR Change Request
//implement replaceById method : update group attributes access by Id
LDAPConnector.prototype.replaceById = function (id, model, data, callback) {
  g.log("ldap-connector: replaceById :" + JSON.stringify(data));
  //console.log(ldapEntry);
  //@TODO ....
  callback(null, "Not yet implemented");
};

//TGR Change Request
//implement updateAttributes method
LDAPConnector.prototype.updateAttributes = function (model, data, options, callback) {
  g.log("ldap-connector: updateAttributes :" + JSON.stringify(data));
  var self = this;
  //changePassword
  searchFilter = "(uid=" + data + ")";
  var requiredAttributes = ["dn"];

  var opts = {
    filter: searchFilter,
    scope: "sub",
    attributes: requiredAttributes,
  };
  self.ldapClient.search(self.settings.searchBase, opts, function (err, res) {
    var queryResult = [];

    res.on("searchEntry", function (entry) {
      queryResult.push(self.LDAPtoModel(entry.object, model));
    });
    res.on("searchReference", function (referral) {
      g.log("ldap-connector: referral: " + referral.uris.join());
    });
    res.on("error", function (err) {
      g.error("ldap-connector: error :" + err.message);
      callback(null, err);
    });
    res.on("end", function (result) {
      //var dn = 'uid=' + data + ',' + 'ou=adherents,' + self.settings.searchBase;
      var dn = queryResult[0].dn;

      var attributes = {};
      var changes = [];

      if (options.password) changes.push(new ldapclient.Change({ operation: "replace", modification: { userPassword: options.password } }));
      if (options.lastName) changes.push(new ldapclient.Change({ operation: "replace", modification: { givenname: options.lastName } }));
      if (options.firstName) changes.push(new ldapclient.Change({ operation: "replace", modification: { sn: options.firstName } }));
      if (options.codecontribuable) changes.push(new ldapclient.Change({ operation: "replace", modification: { codecontribuable: options.codecontribuable } }));
      if (options.jpegphoto) changes.push(new ldapclient.Change({ operation: "replace", modification: { jpegphoto: options.jpegphoto } }));
      if (options.codeordonnateur) changes.push(new ldapclient.Change({ operation: "replace", modification: { codeordonnateur: options.codeordonnateur } }));
      if (options.codecomptablepayeur)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codecomptablepayeur: options.codecomptablepayeur } }));

      if (options.postaladdress) changes.push(new ldapclient.Change({ operation: "replace", modification: { postaladdress: options.postaladdress } }));

      if (options.title) changes.push(new ldapclient.Change({ operation: "replace", modification: { title: options.title } }));
      if (options.cin) changes.push(new ldapclient.Change({ operation: "replace", modification: { cin: options.cin } }));
      if (options.userOU) changes.push(new ldapclient.Change({ operation: "replace", modification: { userOU: options.userOU } }));
      if (options.userRAT) changes.push(new ldapclient.Change({ operation: "replace", modification: { userRAT: options.userRAT } }));
      if (options.mobile) changes.push(new ldapclient.Change({ operation: "replace", modification: { mobile: options.mobile } }));
      if (options.cn) changes.push(new ldapclient.Change({ operation: "replace", modification: { cn: options.completeName } }));
      if (options.codeadministration)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { codeadministration: options.codeadministration } }));
      if (options.codeservice) changes.push(new ldapclient.Change({ operation: "replace", modification: { codeservice: options.codeservice } }));
      if (options.sexe) changes.push(new ldapclient.Change({ operation: "replace", modification: { sexe: options.sexe } }));
      if (options.commentaires) changes.push(new ldapclient.Change({ operation: "replace", modification: { commentaires: options.commentaires } }));
      if (options.titlecode) changes.push(new ldapclient.Change({ operation: "replace", modification: { titlecode: options.titlecode } }));
      if (options.titlehierarchy) changes.push(new ldapclient.Change({ operation: "replace", modification: { titlehierarchy: options.titlehierarchy } }));
      if (options.employeenumber) changes.push(new ldapclient.Change({ operation: "replace", modification: { employeenumber: options.employeenumber } }));
      if (options.uidagtsaisie) changes.push(new ldapclient.Change({ operation: "replace", modification: { uidagtsaisie: options.uidagtsaisie } }));
      if (options.preferredlanguage)
        changes.push(new ldapclient.Change({ operation: "replace", modification: { preferredlanguage: options.preferredlanguage } }));
      if (options.fixe) changes.push(new ldapclient.Change({ operation: "replace", modification: { fixe: options.telephonenumber } }));
      if (options.dn) changes.push(new ldapclient.Change({ operation: "replace", modification: { dn: options.dn } }));

      if (!changes) {
        callback("changes required.", null);
        return;
      }
      if (!dn) {
        callback("No such dn.", null);
        return;
      }

      self.ldapClient.modify(dn, changes, function (err) {
        assert.ifError(err);
        if (err) {
          g.error("ldap-connector: Could Not replace :" + err.message);
          callback(err, null);
        } else {
          g.log("ldap-connector: Changes Successful.");
          callback(null, "Change Successful.");
        }
      });
    });
  });
};

//TGR Change Request
//implement replaceOrCreate method : add user to a  group
LDAPConnector.prototype.replaceOrCreate = function (model, data, where, callback) {
  g.log("ldap-connector: replaceOrCreate :" + JSON.stringify(data));
  var self = this;
  var ldapEntry = this.modeltoLDAPEntry(data, model);

  var members = [];
  if (ldapEntry.uniquemember) {
    var processList = ldapEntry.uniquemember.split(",uid").map(function (val) {
      if (val.indexOf("uid") === -1) members.push("uid" + val);
      else members.push("" + val);
    });
    var dn = "cn=" + ldapEntry["cn"].trim() + "," + self.settings.searchBase;
    var operation = "add";
    var list = [];
    members.forEach(function (member) {
      if (member.indexOf("delete") !== -1) {
        var memberdn = member.split(",delete")[0];
        list.push(memberdn);
        operation = "delete";
      }
    });
    if (operation === "delete") {
      members = list;
    }
    var change = new ldapclient.Change({
      operation: operation,
      modification: {
        uniquemember: members,
      },
    });
    if (!change) {
      callback("change required.", null);
      return;
    }
    if (!dn) {
      callback("No such dn.", null);
      return;
    }

    self.ldapClient.modify(dn, change, function (err) {
      //assert.ifError(err);
      if (err) {
        g.error("ldap-connector: Could Not replace :" + err.message);
        callback(err, null);
      } else {
        g.log("ldap-connector: Change Successful.");
        callback(null, "Change Successful.");
      }
    });
  } else {
    g.log("no uniquemember");
  }
};

//TGR Change Request
//implement destroyAll method
LDAPConnector.prototype.destroyAll = function (model, data, options, callback) {
  g.log("ldap-connector: destroyAll :" + JSON.stringify(data));
  var self = this;
  //changePassword
  if (model === "AppUser") {
    searchFilter = "(uid=" + data.id.inq + ")";
  } else {
    searchFilter = "(cn=" + data.id + ")";
  }
  var requiredAttributes;
  if (model === "AppUser") {
    requiredAttributes = ["dn"];
  } else {
  }

  var opts = {
    filter: searchFilter,
    scope: "sub",
    attributes: requiredAttributes,
  };
  self.ldapClient.search(self.settings.searchBase, opts, function (err, res) {
    var queryResult = [];

    res.on("searchEntry", function (entry) {
      queryResult.push(self.LDAPtoModel(entry.object, model));
    });
    res.on("searchReference", function (referral) {
      g.log("ldap-connector: referral: " + referral.uris.join());
    });
    res.on("error", function (err) {
      g.error("ldap-connector: error :" + err.message);
      callback(null, err);
    });
    res.on("end", function (result) {
      var dn = queryResult[0].dn;
      if (!dn) {
        dn = "cn=" + data.id + "," + self.settings.searchBase;
      }
      self.ldapClient.del(dn, function (err) {
        assert.ifError(err);
        if (err) {
          g.error("ldap-connector: Could Not delete :" + err.message);
          callback(err, null);
        } else {
          g.log("ldap-connector: Delete Successful.");
          callback(null, "Delete Successful.");
        }
      });
    });
  });
};

LDAPConnector.prototype.all = function (model, filter, callback) {
  g.log("ldap-connector: all :" + JSON.stringify(filter));
  var self = this;
  // Building filter
  var searchFilter = {};

  var self = this;
  // Building filter
  var searchFilter = {};

  if (filter["where"]) {
    searchFilter = self.modeltoLDAPFilter(filter["where"], model);
    if (searchFilter["and"]) {
      g.log("ldap-connector: all :" + searchFilter["and"]);
    }
  } else {
    searchFilter = self.settings.searchBaseFilter;
  }
  //TGR Change Request
  //IBM Tivoli LDAP
  //get members of a group
  /*if (searchFilter.indexOf('uniquemember',0) != -1){
      searchFilter = searchFilter.substring(0,searchFilter.length-1);
      searchFilter = searchFilter + '*)';
    }*/

  var modelMapping = self.settings.modelMapping[model]["mapping"];
  if (!modelMapping) {
    g.log("ldap-connector:  Couldn't find a model mapping for " + model.name);
  }
  var requiredAttributes = [];
  for (var key in modelMapping) {
    requiredAttributes.push(modelMapping[key]);
  }
  var opts = {
    filter: searchFilter,
    scope: "sub",
    attributes: requiredAttributes,
  };
  g.log("ldap-connector: all , opts=:" + JSON.stringify(opts));
  self.ldapClient.search(self.settings.searchBase, opts, function (err, res) {
    var queryResult = [];
    res.on("searchEntry", function (entry) {
      queryResult.push(self.LDAPtoModel(entry.object, model));
    });
    res.on("searchReference", function (referral) {
      g.log("ldap-connector: referral: " + referral.uris.join());
    });
    res.on("error", function (err) {
      g.error("ldap-connector: error :" + err.message);
      callback(null, err);
    });
    res.on("end", function (result) {
      callback(null, queryResult);
    });
  });
};
