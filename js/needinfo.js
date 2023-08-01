/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NeedInfoConfig = null;
var DEV_DISABLE = false;
var LastErrorText = '';
var CurrentTeam = null;

/*
 Bugs
 * multiple puts with the same comment results in errors on every request except the first. Some sort of anti-spam feature?
 * Polish the css related to viewport size
 * css of comment text area in dialogs needs polish when resizing
 * move column headers to the html page somehow

 General Ideas
 * Add an account icon up top for employees? Can we do this for key users as well?
 *  - Settings
 *  - My Needinfos option
 *  - My reports option  (we can use specialized team monikors for this, 'myself, 'myteam' so they can be bookmarked easily.)
 * Bugzilla aliases for NI email entries in details
 * set Priority bulk action
 * redirect to triage owner based on google cal injestion?
 * bug assingee changes by nagbots, can we expose who got dropped?
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=969395
 * dealing with double needinfos 
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=1667635#c31

 Details pane
 * how to expose more information without adding columns?
 *  - work on the filtering option
 *  - bug creation date
 *  - component
 *  - sliding drop down with bug detail?
 * expose additional needinfos in the details pane
 * resolve incomplete?
*/

// 'main'
$(document).ready(function () {
  loadConfig();
});

// Load the Bugzilla configuration json file and populate our NeedInfoConfig data
// structure with config information. Then process url parameter input and choose
// the appropriate data to display.
function loadConfig() {
  let jsonUrl = 'js/config.json';
  $.getJSON(jsonUrl, function (configdata) {
    NeedInfoConfig = configdata.bugzillaconfig;
    updateDomains(NeedInfoConfig);

    let team = getTeam();
    CurrentTeam = team;

    if (team == undefined) {
      window.location.href = window.location.href + "?team=empty"
      return;
    }
    let sel = document.getElementById('team-select');
    sel.value = team;

    let userid = getUserId();
    if (userid != undefined && team == 'empty') {
      // individual account request
      loadUserSummary(userid);
      // get empty-option
      document.getElementById('empty-option').text = userid;
      return;
    }

    // Load the team summary
    loadTeamConfig();
  }).fail(function (jqXHR, textStatus, errorThrown) {
    console.log("getJSON call failed for some reason.", jsonUrl, errorThrown)
  });
}

// Load a summary for a specific bugzilla email account
function loadUserSummary(email) {
  CurrentTeam = 'empty';
  let sel = document.getElementById('team-select');
  sel.value = CurrentTeam;

  // populate additional cookie data in NeedInfoConfig
  loadSettingsInternal();

  LastErrorText = '';
  $("#errors").empty();

  NeedInfoConfig.developers = {};
  NeedInfoConfig.developers[email] = email;
  loadPage();
}

function event_loadUserSummary(e, developer) {
  if (e) {
    e.preventDefault();
  }
  let userid = NeedInfoConfig.developers[developer];
  openDetailsForAccount(userid);
}

function openDetailsForAccount(email) {
  let url = replaceUrlParam(window.location.href, 'userid', email);
  url = replaceUrlParam(url, 'team', 'empty')
  window.location.href = url;
}

// Load a summary for a configured team based on
// the team's json config file.
function loadTeamConfig() {
  // populate additional cookie data in NeedInfoConfig
  loadSettingsInternal();

  NeedInfoConfig.developers = {};

  LastErrorText = '';
  $("#errors").empty();

  prepPage();

  var team = getTeam();
  if (team == 'empty') {
    // don't load anything.
    return;
  }

  // load a specific team config file.
  let jsonUrl = 'js/' + team + '.json';
  $.getJSON(jsonUrl, function (teamConfig) {
    NeedInfoConfig.developers = teamConfig.developers;
    loadPage();
  }).fail(function (jqXHR, textStatus, errorThrown) {
    console.log("getJSON call failed for some reason.", jsonUrl, errorThrown)
  });
}

function prepPage() {
  $("#report").empty();
  var content =
    "<div class='report-title'>Engineer</div>" +
    "<div class='report-odr'>Open Dev Related</div>" +
    "<div class='report-otr' title='Bugs with any needinfos for you that track the current nightly, beta, or release versions of Firefox.'>Open Tracked</div>" +
    "<div class='report-cdr'>Closed Dev Related</div>" +
    "<div class='report-onb'>Open Nagbot</div>" +
    "<div class='report-cnb'>Closed Nagbot</div>";
  // This is an elemet id idx and must match up when we
  // populate each row in displayCountFor.
  let elementIndex = 0;
  for (var developer in NeedInfoConfig.developers) {
    elementIndex++;
    content +=
      "<a href='' onclick=\"event_loadUserSummary(event, '" + developer + "')\"><div class='report-title'>" + developer + "</div></a>" +
      "<div class='report-odr' id='data_odr_" + elementIndex + "'>?</div>" +
      "<div class='report-otr' id='data_otr_" + elementIndex + "'>?</div>" +
      "<div class='report-cdr' id='data_cdr_" + elementIndex + "'>?</div>" +
      "<div class='report-onb' id='data_onb_" + elementIndex + "'>?</div>" +
      "<div class='report-cnb' id='data_cnb_" + elementIndex + "'>?</div>";
  }
  if (content.length) {
    $("#report").append(content);
  }
  checkConfig();
}

function loadPage() {
  prepPage();

  if (DEV_DISABLE)
    return;

  let elementIndex = 0;
  for (let developer in NeedInfoConfig.developers) {
    elementIndex++;
    let id = encodeURIComponent(NeedInfoConfig.developers[developer]);
    let url = NeedInfoConfig.bugzilla_search_url;

    /////////////////////////////////////////////////////////
    // Base query and resulting fields request
    /////////////////////////////////////////////////////////

    // include_fields=id,summary

    // v1={id}
    // o1=equals
    // f1=requestees.login_name

    // f2=flagtypes.name
    // o2=equals
    // v2=needinfo?

    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);

    /////////////////////////////////////////////////////////
    // Open Developer Related
    /////////////////////////////////////////////////////////

    // f3=setters.login_name
    // o3=notequals
    // v3=release-mgmt-account-bot%40mozilla.tld

    url += "&f3=setters.login_name";
    url += "&o3=nowordssubstr";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";

    // Ignore needinfos set by the account we're querying for.
    if (NeedInfoConfig.ignoremyni) {
      url += "," + id;
    }

    // f4=bug_status
    // o4=nowordssubstr / anywordssubstr
    // v4=RESOLVED%2CVERIFIED%2CCLOSED

    url += "&f4=bug_status";
    url += "&o4=nowordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";

    retrieveInfoFor(url, id, elementIndex, developer, 'odr');

    /////////////////////////////////////////////////////////
    // Open and Tracked
    // Query uses the generic tag names that bugzilla maps
    // to the current version tags.
    /////////////////////////////////////////////////////////

    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);

    // f4=bug_status
    // o4=nowordssubstr / anywordssubstr
    // v4=RESOLVED%2CVERIFIED%2CCLOSED

    url += "&f3=bug_status";
    url += "&o3=nowordssubstr";
    url += "&v3=RESOLVED%2CVERIFIED%2CCLOSED";

    // f5=cf_tracking_firefox_beta
    // o5=anywords
    // v5=%2B

    url += '&f4=OP';

    url += '&j4=OR';

    url += "&f5=cf_tracking_firefox_nightly";
    url += "&o5=anywords";
    url += "&v5=%2B";

    url += "&f6=cf_tracking_firefox_beta";
    url += "&o6=anywords";
    url += "&v6=%2B";

    url += "&f7=cf_tracking_firefox_release";
    url += "&o7=anywords";
    url += "&v7=%2B";

    url += '&f8=CP'

    retrieveInfoFor(url, id, elementIndex, developer, 'otr');

    /////////////////////////////////////////////////////////
    // Closed Developer Related
    /////////////////////////////////////////////////////////

    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name";
    url += "&o3=notequals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";

    url += "&f4=bug_status";
    url += "&o4=anywordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";

    // Ignore needinfos set by the account we're querying for.
    if (NeedInfoConfig.ignoremyni) {
      url += "&f5=setters.login_name";
      url += "&o5=notequals";
      url += "&v5=" + id;
    }

    retrieveInfoFor(url, id, elementIndex, developer, 'cdr');

    /////////////////////////////////////////////////////////
    // Open Nagbot
    /////////////////////////////////////////////////////////

    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name";
    url += "&o3=equals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";

    url += "&f4=bug_status";
    url += "&o4=nowordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";

    retrieveInfoFor(url, id, elementIndex, developer, 'onb');

    /////////////////////////////////////////////////////////
    // Closed Nagbot
    /////////////////////////////////////////////////////////

    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name";
    url += "&o3=equals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";

    url += "&f4=bug_status";
    url += "&o4=anywordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";

    retrieveInfoFor(url, id, elementIndex, developer, 'cnb');
  }
}

function refreshList(e) {
  if (e) {
    e.preventDefault();
  }
  loadConfig();
}

function teamSelectionChanged(el) {
  var team = el.options[el.selectedIndex].value;
  if (team == 'specific-account') {
    queryAccount();
    return;
  }
  window.location.href = replaceUrlParam(window.location.href, 'team', team);
}

function errorMsg(text) {
  if (LastErrorText == text)
    return;
  $("#errors").append(text);
  LastErrorText = text;
}

// this function's sole reason for existing is to provide
// a capture context for the AJAX values...
function retrieveInfoFor(url, id, elementIndex, developer, userQuery) {
  $.ajax({
    url: url,
    success: function (data) {
      displayCountFor(id, elementIndex, developer, url, userQuery, data);
    }
  })
  .error(function(jqXHR, textStatus, errorThrown) {
    console.log("status:", textStatus);
    console.log("error thrown:", errorThrown);
    console.log("response text:", jqXHR.responseText);
    try {
      let info = JSON.parse(jqXHR.responseText);
      let text = info.message ? info.message : errorThrown;
      errorMsg(text);
      return;
    } catch(e) {
    }
    errorMsg(errorThrown);
  });
}

function displayCountFor(id, elementIndex, developer, url, type, data) {
  var ni_count = data.bugs.length;
  let tabTarget = NeedInfoConfig.targetnew ? "buglists" : "_blank";

  var bug_link = "" + ni_count;
  if (ni_count != 0) {
    let dash_link = "details.html?" + "&userquery=" + type + "&userid=" + id;
    let bug_list = restToQueryUrl(url);
    bug_link = "<div class='bug-link-container'><a class='bug-link' title='Needinfo Details' href='" + dash_link + "' target='nilist'>" + ni_count + "</a>";
    bug_link += "<a class='bug-icon' title='Bugzilla Bug List' href='" + bug_list + "' target='" + tabTarget + "'><img src='images/favicon.ico' /></a></div>";
  }

  if (!ni_count) {
    bug_link = "&nbsp;";
  }

  let link = "<div class='report-" + type + "' id='data_" + elementIndex + "'>" + bug_link + "</div>";
  $("#data_" + type + "_" + elementIndex).replaceWith(link);
}

function settingsUpdated() {
  checkConfig();
  refreshList(null);
}

function checkConfig() {
  if (!NeedInfoConfig.api_key || NeedInfoConfig.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}

function getRedirectToAccount() {
  if (!document.getElementById('autofill-user-search').disabled &&
      document.getElementById('autofill-user-search').value) {
    return document.getElementById('autofill-user-search').value;
  }
  let to = document.getElementById("prompt-redirect-to-confirm-to").value;
  if (!to.length) {
    to = null;
  }
  return to;
}

function queryAccount() {
  let dlg = document.getElementById("prompt-query-account");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      let to = getRedirectToAccount();
      if (to != null) {
        // Open a details page for a specific account
        openDetailsForAccount(to);
      }
    } else {
    }
  }, { once: true });
  dlg.show();
}

function submitUserSearch(value) {
  let url = NeedInfoConfig.bugzilla_user_url;
  url = url.replace('{value}', value);
  if (NeedInfoConfig.api_key.length) {
    url += "&api_key=" + NeedInfoConfig.api_key;
  }
  $('#autofill-user-search').empty();
  $.ajax({
    url: url,
    success: function (data) {
      // data.users.name and real_name
      data.users.forEach(function (val) {
        let name = "" + val.real_name;
        let email = "" + val.name;
        if (name.length == 0) {
          name = ' ';
        }
        name += ' (' + email + ')';
        $('#autofill-user-search').append(new Option(name, email));
      });
      document.getElementById('autofill-user-search').disabled = false;
    }
  })
  .error(function(jqXHR, textStatus, errorThrown) {
    console.log("status:", textStatus);
    console.log("error thrown:", errorThrown);
    console.log("response text:", jqXHR.responseText);
    try {
      let info = JSON.parse(jqXHR.responseText);
      let text = info.message ? info.message : errorThrown;
      errorMsg(text);
      return;
    } catch(e) {
    }
    errorMsg(errorThrown);
  });
}

function searchForNick(element) {
  $('#autofill-user-search').empty();
  document.getElementById('autofill-user-search').disabled = true;

  let value = element.value;
  if (!value) {
    return;
  }
  if (value.element < 3) {
    return;
  }

  console.log('searching for', value);
  submitUserSearch(value);
}

var SearchTimeoutId = -1;
function onInputForBugzillaUser(element) {
  clearTimeout(SearchTimeoutId);
  SearchTimeoutId = setTimeout(function () {
    searchForNick(element);
  }, 750);
}
