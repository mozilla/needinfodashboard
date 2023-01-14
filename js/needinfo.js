/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NeedInfoConfig = null;
var DEV_DISABLE = false;
var LastErrorText = '';

/*
 Bugs
 * multiple puts with the same comment results in errors on every request except the first. Some sort of anti-spam feature?
 * Polish the css related to viewport size
 * css of comment text area in dialogs needs polish when resizing

 General
 * Bugzilla aliases for NI email entries in details
 * set Priority bulk action
 * redirect to triage owner based on google cal injestion?
 * bug assingee changes by nagbots, can we expose who got dropped?
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=969395
 * dealing with double needinfos 
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=1667635#c31

 Details pane
 * how to expose more information without adding columns?
 *  - bug creation date
 *  - component
 *  - sliding drop down with bug detail?
 * expose additional needinfos in the details pane
 * resolve incomplete?
*/
 
$(document).ready(function () {
  var team = getTeam();
  if (team == undefined) {
    window.location.href = window.location.href + "?team=media"
    return;
  }

  let sel = document.getElementById('team-select');
  sel.value = team;

  loadPage();
});

function loadPage() {
  var team = getTeam();
  let jsonUrl = 'js/' + team + '.json';
  $.getJSON(jsonUrl, function (data) {
    main(data);
  }).fail(function () {
    console.log("getJSON call failed for some reason.", jsonUrl)
  });
}

function prepPage() {
  $("#report").empty();
  var content =
    "<div class='report-title'>Engineer</div>" +
    "<div class='report-odr'>Open Dev Related</div>" +
    "<div class='report-cdr'>Closed Dev Related</div>" +
    "<div class='report-onb'>Open Nagbot</div>" +
    "<div class='report-cnb'>Closed Nagbot</div>";
  for (var key in NeedInfoConfig.developers) {
    content +=
      "<div class='report-title'>" + key + "</div>" +
      "<div class='report-odr' id='data_odr_" + key + "'>?</div>" +
      "<div class='report-cdr' id='data_cdr_" + key + "'>?</div>" +
      "<div class='report-onb' id='data_onb_" + key + "'>?</div>" +
      "<div class='report-cnb' id='data_cnb_" + key + "'>?</div>";
  }
  if (content.length) {
    $("#report").append(content);
  }
  checkConfig();
}

function refreshList(e) {
  if (e) {
    e.preventDefault();
  }
  loadPage();
}

function main(json)
{
  LastErrorText = '';
  $("#errors").empty();

  NeedInfoConfig = json.needinfo;

  updateDomains(NeedInfoConfig);
  loadSettingsInternal();
  prepPage();

  if (DEV_DISABLE)
    return;

  for (var key in NeedInfoConfig.developers) {
    let id = encodeURIComponent(NeedInfoConfig.developers[key]);
    let url = NeedInfoConfig.bugzilla_search_url;

    //////////////////////////////////////////
    // Base query and resulting fields request
    //////////////////////////////////////////

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

    //////////////////////////////////////////
    // Open Developer Related
    //////////////////////////////////////////

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

    retrieveInfoFor(url, id, key, 'odr');

    //////////////////////////////////////////
    // Closed Developer Related
    //////////////////////////////////////////

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

    retrieveInfoFor(url, id, key, 'cdr');

    //////////////////////////////////////////
    // Open Nagbot
    //////////////////////////////////////////

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

    retrieveInfoFor(url, id, key, 'onb');

    //////////////////////////////////////////
    // Closed Nagbot
    //////////////////////////////////////////

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

    retrieveInfoFor(url, id, key, 'cnb');
  }
}

function replaceUrlParam(url, paramName, paramValue) {
  if (paramValue == null) {
    paramValue = '';
  }
  var pattern = new RegExp('\\b(' + paramName + '=).*?(&|#|$)');
  if (url.search(pattern) >= 0) {
    return url.replace(pattern, '$1' + paramValue + '$2');
  }
  url = url.replace(/[?#]$/, '');
  return url + (url.indexOf('?') > 0 ? '&' : '?') + paramName + '=' + paramValue;
}

function teamSelectionChanged(el) {
  var team = el.options[el.selectedIndex].value;
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
function retrieveInfoFor(url, id, key, userQuery)
{
  $.ajax({
    url: url,
    success: function (data) {
      displayCountFor(id, key, url, userQuery, data);
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

function displayCountFor(id, key, url, type, data)
{
  var ni_count = data.bugs.length;
  let tabTarget = NeedInfoConfig.targetnew ? "buglists" : "_blank";

  var bug_link = "" + ni_count;
  if (ni_count != 0) {
    let dash_link = "details.html?" + "team=" + getTeam() + "&userquery=" + type + "&userid=" + id;
    let bug_list = restToQueryUrl(url);
    bug_link = "<div class='bug-link-container'><a class='bug-link' href='" + dash_link + "' target='nilist'>" + ni_count + "</a>";
    bug_link += "<a class='bug-icon' href='" + bug_list + "' target='" + tabTarget + "'><img src='images/favicon.ico' /></a></div>";
  }

  if (!ni_count) {
    bug_link = "&nbsp;";
  }

  let link = "<div class='report-" + type + "' id='data_" + key + "'>" + bug_link + "</div>";
  $("#data_" + type + "_" + key).replaceWith(link);
}

function settingsUpdated() {
  checkConfig();
  refreshList(null);
}

function checkConfig() {
  if (NeedInfoConfig.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}
