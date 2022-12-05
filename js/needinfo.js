/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NEEDINFO = null;

/*
 - bug assingee changes by nagbots, can we expose who got dropped?
 -- https://bugzilla.mozilla.org/show_bug.cgi?id=969395
 - dealing with double needinfos 
 -- https://bugzilla.mozilla.org/show_bug.cgi?id=1667635#c31
 - fix details targets
 - teams selector and config file
 - sec bug inclusion
 -- make sure this is working
 - Details pane
 -- authentication for posting changes
 -- bulk actions with comment
 -- redirect ni feature?
*/
 
$(document).ready(function () {
  var team = getTeam();
  if (team == undefined) {
    window.location.href = window.location.href + "?team=media"
    return;
  }

  let sel = document.getElementById('team-select');
  sel.value = team;

  $.getJSON('js/' + team + '.json', function (data) {
    main(data);
  });
});

function prepPage(count) {
  var content = "";
  for (var key in NEEDINFO.developers) {
    content +=
      "<div class='name-title'>" + key + "</div>" +
      "<div class='name-odr' id='data_odr_" + key + "'>?</div>" +
      "<div class='name-cdr' id='data_cdr_" + key + "'>?</div>" +
      "<div class='name-onb' id='data_onb_" + key + "'>?</div>" +
      "<div class='name-cnb' id='data_cnb_" + key + "'>?</div>";
  }
  if (content.length) {
    $("#report").append(content);
  }
}

function main(json)
{
  NEEDINFO = json.needinfo;

  loadSettingsInternal();

  prepPage(NEEDINFO.developers.size);
  return;

  for (var key in NEEDINFO.developers) {
    let id = encodeURIComponent(NEEDINFO.developers[key]);
    let url = NEEDINFO.bugzilla_rest_url;

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

    if (NEEDINFO.api_key.length) {
      url += "api_key=" + NEEDINFO.api_key + "&";
    }
    url += NEEDINFO.fields_query.replace("{id}", id);

    //////////////////////////////////////////
    // Open Developer Related
    //////////////////////////////////////////

    // f3=setters.login_name
    // o3=notequals
    // v3=release-mgmt-account-bot%40mozilla.tld

    url += "&f3=setters.login_name"
    url += "&o3=nowordssubstr"
    url += "&v3=release-mgmt-account-bot%40mozilla.tld"

    // Ignore needinfos set by the account we're querying for.
    if (NEEDINFO.ignoremyni) {
      url += "," + id;
    }

    // f4=bug_status
    // o4=nowordssubstr / anywordssubstr
    // v4=RESOLVED%2CVERIFIED%2CCLOSED

    url += "&f4=bug_status"
    url += "&o4=nowordssubstr"
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"

    retrieveInfoFor(url, id, key, 'odr');

    //////////////////////////////////////////
    // Closed Developer Related
    //////////////////////////////////////////

    url = NEEDINFO.bugzilla_rest_url;
    if (NEEDINFO.api_key.length) {
      url += "api_key=" + NEEDINFO.api_key + "&";
    }
    url += NEEDINFO.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name"
    url += "&o3=notequals"
    url += "&v3=release-mgmt-account-bot%40mozilla.tld"

    url += "&f4=bug_status"
    url += "&o4=anywordssubstr"
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"

    retrieveInfoFor(url, id, key, 'cdr');

    //////////////////////////////////////////
    // Open Nagbot
    //////////////////////////////////////////

    url = NEEDINFO.bugzilla_rest_url;
    if (NEEDINFO.api_key.length) {
      url += "api_key=" + NEEDINFO.api_key + "&";
    }
    url += NEEDINFO.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name"
    url += "&o3=equals"
    url += "&v3=release-mgmt-account-bot%40mozilla.tld"

    url += "&f4=bug_status"
    url += "&o4=nowordssubstr"
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"

    retrieveInfoFor(url, id, key, 'onb');

    //////////////////////////////////////////
    // Closed Nagbot
    //////////////////////////////////////////

    url = NEEDINFO.bugzilla_rest_url;
    if (NEEDINFO.api_key.length) {
      url += "api_key=" + NEEDINFO.api_key + "&";
    }
    url += NEEDINFO.fields_query.replace("{id}", id);

    url += "&f3=setters.login_name"
    url += "&o3=equals"
    url += "&v3=release-mgmt-account-bot%40mozilla.tld"

    url += "&f4=bug_status"
    url += "&o4=anywordssubstr"
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"

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

// this function's sole reason for existing is to provide
// a capture context for the AJAX values...
function retrieveInfoFor(url, id, key, type)
{
    $.ajax({
      url: url,
      success: function (data) {
        displayCountFor(id, key, url, type, data);
      }
    })
    .error(function(jqXHR, textStatus, errorThrown) {
      console.log("error " + textStatus);
      console.log("incoming Text " + jqXHR.responseText);
    });
}

function displayCountFor(id, key, url, type, data)
{
  var ni_count = data.bugs.length;

  var bug_link = "" + ni_count;
  if (ni_count != 0) {
    // '/rest/bug' | '/buglist.cgi'
    // http://127.0.0.1/details.html?team=media&userquery=odr&userid=jib@mozilla.com
    let dash_link = "details.html?" + "team=" + getTeam() + "&userquery=" + type + "&userid=" + id;
    let bug_list = url;
    bug_list = bug_list.replace('/rest/bug', '/buglist.cgi');
    bug_link = "<div class='bug-link-container'><a class='bug-link' href='" + dash_link + "' target='nilist' rel='noopener noreferrer'>" + ni_count + "</a>";
    bug_link += "<a class='bug-icon' href='" + bug_list + "' target='buglist' rel='noopener noreferrer'><img src='images/favicon.ico' /></a></div>";
  }

  if (!ni_count) {
    bug_link = "&nbsp;";
  }

  let link = "<div class='name-" + type + "' id='data_" + key + "'>" + bug_link + "</div>";
  $("#data_" + type + "_" + key).replaceWith(link);
}

function openSettings() {
  if(NEEDINFO.api_key.length) {
    var api_key = document.getElementById("api-key");
    api_key.value = NEEDINFO.api_key;
  }
  document.getElementById("option-ignoremyni").checked = NEEDINFO.ignoremyni;
  document.getElementById("option-save").checked = NEEDINFO.saveoptions;

  document.getElementById("popupForm").style.display = "block";
}
  
function closeSettings() {
  document.getElementById("popupForm").style.display = "none";
}

function saveSettings(e) {
  e.preventDefault();

  var x = $("form").serializeArray();

  var values = {};
  $.each(x, function (i, field) {
    values[field.name] = field.value;
    // key <empty string>
    // option-ignoremyni on
    // options-save on
  });

  let reload_page = false;

  // 'remember my settings' checkbox
  var use_local = JSON.stringify(values).includes("remember");

  // API key
  var old_api_key = "";
  var key = getFromStorage("api-key");
  if (key != null) {
    old_api_key = key;
  }

  clearStorage("api-key");

  let storage = use_local ? localStorage : sessionStorage;
  if (old_api_key != values.key) {
    storage.setItem("api-key", values.key);
    reload_page = true;
  }

  clearStorage("ignoremyni");
  storage.setItem("ignoremyni", values.ignoremyni == 'on' ? true : false);

  clearStorage("save");
  storage.setItem("save", values.save == 'on' ? true : false);

  closeSettings();

  if (reload_page) {
    window.location.reload(true);
    return;
  }

  loadSettingsInternal();
}