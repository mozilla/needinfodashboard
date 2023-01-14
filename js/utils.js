/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function getTeam() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get('team');
}

function getUserId() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get('userid');
}

function getUserQuery() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get('userquery');
}

function updateDomains() {
  // If requested via the json config file, point all queries at
  // a bugzilla test instance. 
  let domain = NeedInfoConfig.bugzilla_domain;
  if (NeedInfoConfig.use_test_domain) {
    domain = NeedInfoConfig.bugzilla_test_domain;
  }
  NeedInfoConfig.bugzilla_search_url =
    NeedInfoConfig.bugzilla_search_url.replace('{domain}', domain);
  NeedInfoConfig.bugzilla_put_url =
    NeedInfoConfig.bugzilla_put_url.replace('{domain}', domain);
  NeedInfoConfig.bugzilla_link_url =
    NeedInfoConfig.bugzilla_link_url.replace('{domain}', domain);
  NeedInfoConfig.bugzilla_user_url =
    NeedInfoConfig.bugzilla_user_url.replace('{domain}', domain);

  console.log("Bugzilla target:", domain);
}

// generate random integer in the given range
function randomNumber(min, max) { 
    return Math.round(Math.random() * (max - min) + min);
}

function restToQueryUrl(url) {
  // '/rest/bug' | '/buglist.cgi'
  return url.replace('/rest/bug', '/buglist.cgi');
}

function trimAddress(account) {
  if (account == undefined) {
    // Unassigned
    account = '';
  }

  for (const [key, value] of Object.entries(NeedInfoConfig.developers)) {
    if (value == account) {
      account = key;
      break;
    }
  }

  account = account.replace('nobody@mozilla.org', 'nobody');

  // Todo: get the alias from bugzilla

  // aryx.bugmail@gmx-topmail.de
  account = account.replace('aryx.bugmail@gmx-topmail.de', 'Aryx');
  // ryanvm@gmail.com
  account = account.replace('ryanvm@gmail.com', 'RyanVM');
  // nagbot
  account = account.replace('release-mgmt-account-bot@mozilla.tld', 'nag-bot');
  // updatebot
  account = account.replace('update-bot@bmo.tld', 'update-bot');

  account = account.replace('@mozilla.org', '@moz');
  account = account.replace('@mozilla.com', '@moz');
  return account;
}

function getFromStorage(keyname) {
  let value = sessionStorage.getItem(keyname);
  if (value == null || !value.length) {
    //console.log('session storage value for ', keyname, ' does not exist.');
    value = localStorage.getItem(keyname);
    if (value == null || !value.length) {
      //console.log('persistent storage value for ', keyname, ' does not exist.');
    } else {
      //console.log('persistent storage value for ', keyname, ':', value);
    }
  } else {
    //console.log('session storage value for ', keyname, ':', value);
  }
  return value;
}

function clearStorage(keyname) {
  localStorage.removeItem(keyname);
  sessionStorage.removeItem(keyname);
}

function saveDefaultSortSettings(type, currentOrder) {
  if (NeedInfoConfig.saveoptions) {
    localStorage.setItem("sort", type); // string
    localStorage.setItem("sortorder", currentOrder); // boolean
  }
}

function getDefaultSortSettings() {
  return { 'sort': getFromStorage('sort'), 'order': getFromStorage('sortorder') };
}

function loadSettingsInternal() {
  let api_key = getFromStorage("api-key");

  NeedInfoConfig.api_key = (api_key == null) ? "" : api_key;
  NeedInfoConfig.ignoremyni = getFromStorage("ignoremyni") == (null || 'false') ? false : true;
  NeedInfoConfig.saveoptions = getFromStorage("save") == (null || 'false') ? false : true;
  NeedInfoConfig.targetnew = getFromStorage("target") == (null || 'false') ? false : true;

  console.log('storage key:', NeedInfoConfig.api_key);
  console.log('ignore:', NeedInfoConfig.ignoremyni);
  console.log('persist:', NeedInfoConfig.saveoptions);
  console.log('targets:', NeedInfoConfig.targetnew);
}

function openSettings() {
  if (NeedInfoConfig.api_key.length) {
    document.getElementById("api-key").value = NeedInfoConfig.api_key;
  }
  document.getElementById("option-ignoremyni").checked = NeedInfoConfig.ignoremyni;
  document.getElementById("option-save").checked = NeedInfoConfig.saveoptions;
  document.getElementById("option-targets").checked = NeedInfoConfig.targetnew;

  document.getElementById("popupForm").style.display = "block";
}

function closeSettings() {
  document.getElementById("popupForm").style.display = "none";
}

function saveSettings(e) {
  e.preventDefault();

  let x = $("form").serializeArray();
  let values = {};
  $.each(x, function (i, field) {
    values[field.name] = field.value;
  });

  // 'remember my settings' checkbox
  let usePersistent = JSON.stringify(values).includes("save");
  console.log('use persistent storage:', usePersistent);

  // API key
  let old_api_key = "";
  let key = getFromStorage("api-key");
  if (key != null) {
    old_api_key = key;
  }

  let storage = usePersistent ? localStorage : sessionStorage;

  clearStorage("api-key");
  storage.setItem("api-key", values.key);

  clearStorage("ignoremyni");
  storage.setItem("ignoremyni", values.ignoremyni == 'on' ? true : false);

  clearStorage("save");
  storage.setItem("save", values.save == 'on' ? true : false);

  clearStorage("target");
  storage.setItem("target", values.target == 'on' ? true : false);

  closeSettings();
  loadSettingsInternal();
  settingsUpdated();
}

/* sorting utilities */

// sorting:
// If the result is negative, a is sorted before b.
// If the result is positive, b is sorted before a.
// If the result is 0, no changes are done with the sort order of the two values.

function sortDateAsc(a, b) {
  return a.date < b.date;
}

function sortDateDesc(a, b) {
  return a.date > b.date;
}

function sortBugIdAsc(a, b) {
  return a.bugid < b.bugid;
}

function sortBugIdDesc(a, b) {
  return a.bugid > b.bugid;
}

// severity - S1 - S4, enhancement, trivial, minor, normal, major, critical, blocker, N/A, --
var sVals = {
  '--': 0,
  'S1': 1,
  'S2': 2,
  'S3': 3,
  'S4': 4,
  'blocker': 1,
  'critical': 1,
  'major': 2,
  'normal': 3,
  'minor': 4,
  'trivial': 4,
  'enhancement': 4,
  'N/A': 4,
};

function sortSeverityAsc(a, b) {
  return sVals[a.severity] >= sVals[b.severity];
}

function sortSeverityDesc(a, b) {
  return sVals[a.severity] < sVals[b.severity];
}

var pVals = {
  '--': 0,
  'P1': 1,
  'P2': 2,
  'P3': 3,
  'P4': 4,
  'P5': 5,
};

function sortPriorityAsc(a, b) {
  return pVals[a.priority] >= pVals[b.priority];
}

function sortPriorityDesc(a, b) {
  return pVals[a.priority] < pVals[b.priority];
}


