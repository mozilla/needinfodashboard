/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NeedInfoConfig = null;
var DEV_DISABLE = false;
var LastErrorText = '';
var CurrentTeam = null;
var PageStats;

/*
 Bugs
 * multiple puts with the same comment results in errors on every request except
     the first. Hits some sort of Bugzilla anti-spam feature?

 General Ideas
 * performance - need to decrease the number of queries
 * Add an account icon up top for employees? Can we do this for key users as well?
 * Bugzilla aliases for NI email entries in details
 * set Priority and Severity bulk action?
 * redirect to triage owner based on google cal injestion?
 * Bug assingee changes by nagbots, can we expose who got dropped?
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=969395
 * Dealing with double needinfos 
    -  https://bugzilla.mozilla.org/show_bug.cgi?id=1667635#c31

 Details pane
 * how to expose more information without adding columns?
 *  - work on the filtering option
 *  - bug creation date
 *  - component
 *  - sliding drop down with bug detail?
 * resolve incomplete feature?
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

  document.getElementById('oldest-search-date').value = NeedInfoConfig.lastdate == null ? 
    getTodaysDateMinusOneYear() : NeedInfoConfig.lastdate; 

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

  document.getElementById('oldest-search-date').value = NeedInfoConfig.lastdate == null ? 
    getTodaysDateMinusOneYear() : NeedInfoConfig.lastdate; 

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
  resetPageStats();
  $("#report").empty();

  var frag = document.createDocumentFragment();
  let sel = document.getElementById('team-select');
  let teamLabel = (sel && sel.value !== 'empty') ? sel.options[sel.selectedIndex].text : 'Needinfo Summary';
  frag.appendChild(el('div', { cls: 'table-title-bar', text: teamLabel }));
  frag.appendChild(el('div', { cls: 'report-title row-header', text: 'Engineer' }));
  frag.appendChild(el('div', { cls: 'report-odr row-header', text: 'Open Dev Related' }));
  frag.appendChild(el('div', { cls: 'report-otr row-header', title: 'Bugs with any needinfos for you that track the current nightly, beta, or release versions of Firefox.', text: 'Open Tracked' }));
  frag.appendChild(el('div', { cls: 'report-cdr row-header', text: 'Closed Dev Related' }));
  frag.appendChild(el('div', { cls: 'report-onb row-header', text: 'Open Nagbot' }));
  frag.appendChild(el('div', { cls: 'report-cnb row-header', text: 'Closed Nagbot' }));

  // This is an element id idx and must match up when we
  // populate each row in displayCellFor.
  let devIndex = 0;
  for (let developer in NeedInfoConfig.developers) {
    devIndex++;
    let rowClass = (devIndex % 2 === 1) ? 'row-odd' : 'row-even';
    let link = el('a', { href: '', cls: rowClass });
    link.addEventListener('click', function(e) { event_loadUserSummary(e, developer); });
    link.appendChild(el('div', { cls: 'report-title', text: developer }));
    frag.appendChild(link);
    frag.appendChild(el('div', { cls: 'report-odr ' + rowClass, id: 'data_odr_' + devIndex, text: '?' }));
    frag.appendChild(el('div', { cls: 'report-otr ' + rowClass, id: 'data_otr_' + devIndex, text: '?' }));
    frag.appendChild(el('div', { cls: 'report-cdr ' + rowClass, id: 'data_cdr_' + devIndex, text: '?' }));
    frag.appendChild(el('div', { cls: 'report-onb ' + rowClass, id: 'data_onb_' + devIndex, text: '?' }));
    frag.appendChild(el('div', { cls: 'report-cnb ' + rowClass, id: 'data_cnb_' + devIndex, text: '?' }));
  }
  document.getElementById('report').appendChild(frag);

  if (devIndex > 1) {
    var totalFrag = document.createDocumentFragment();
    totalFrag.appendChild(el('div', { cls: 'report-title row-totals', text: '' }));
    totalFrag.appendChild(el('div', { cls: 'report-odr row-totals', id: 'odr-total', text: '' + PageStats.devOpen }));
    totalFrag.appendChild(el('div', { cls: 'report-otr row-totals', id: 'otr-total', text: '' + PageStats.tracked }));
    totalFrag.appendChild(el('div', { cls: 'report-cdr row-totals', id: 'cdr-total', text: '' + PageStats.devClosed }));
    totalFrag.appendChild(el('div', { cls: 'report-onb row-totals', id: 'onb-total', text: '' + PageStats.nagOpen }));
    totalFrag.appendChild(el('div', { cls: 'report-cnb row-totals', id: 'cnb-total', text: '' + PageStats.nagClosed }));
    document.getElementById('report').appendChild(totalFrag);
  }

  checkConfig();
}

function resetPageStats() {
  PageStats = {
    devOpen: 0,
    devClosed: 0,
    tracked: 0,
    nagOpen: 0,
    nagClosed: 0
  };
}

function populatePageStats() {
  if (document.getElementById('odr-total')) {
    document.getElementById('odr-total').textContent = PageStats.devOpen;
    document.getElementById('otr-total').textContent = PageStats.tracked;
    document.getElementById('cdr-total').textContent = PageStats.devClosed;
    document.getElementById('onb-total').textContent = PageStats.nagOpen;
    document.getElementById('cnb-total').textContent = PageStats.nagClosed;
  }
}

function lastDateChanged() {
  console.log('lastDateChanged', document.getElementById('oldest-search-date').value);
  saveLastDate();
}

function getBugzillaMaxDateQuery() {
  let date = null;
  if (NeedInfoConfig.lastdate) {
    date = NeedInfoConfig.lastdate;
  } else {
    date = document.getElementById('oldest-search-date').value;
  }

  //console.log('query last date', date); // '2024-05-08'  | bugzilla: '2014-09-29T14:25:35Z'

  if (date && date.length) {
    // chfieldfrom=2023-05-23&chfield=[Bug creation]
    return '&chfield=[Bug creation]' + '&chfieldfrom=' + date;
  }
  return '';
}

function getMaxDateParameter() {
  let date = document.getElementById('oldest-search-date').value;
  // console.log('date', date); // '2024-05-08'  | bugzilla: '2014-09-29T14:25:35Z'
  if (date.length) {
    // chfieldfrom=2023-05-23&chfield=[Bug creation]
    return '&creation_time=' + date;
  }
  return '';
}

function loadPage() {
  prepPage();

  if (DEV_DISABLE)
    return;

  let elementIndex = 0;
  for (let developer in NeedInfoConfig.developers) {
    elementIndex++;
    // This should be the id of the dev we are querying for, not the
    // current user. We use this to filter selfnis when we query for
    // each developer's list.
    let id = encodeURIComponent(NeedInfoConfig.developers[developer]);

    /////////////////////////////////////////////////////////
    // Build per-category Bugzilla link URLs (for icon links only, no AJAX)
    // These use fields_query (exclude_fields=_all) so Bugzilla returns a
    // standard bug list page when converted via restToQueryUrl().
    /////////////////////////////////////////////////////////

    let linkUrls = {};
    let url;

    // ODR link URL
    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);
    url += getBugzillaMaxDateQuery();
    url += "&f3=setters.login_name";
    url += "&o3=nowordssubstr";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";
    if (NeedInfoConfig.ignoremyni) {
      url += "," + id;
    }
    url += "&f4=bug_status";
    url += "&o4=nowordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
    linkUrls.odr = url;

    // OTR link URL
    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);
    url += getBugzillaMaxDateQuery();
    url += "&f3=bug_status";
    url += "&o3=nowordssubstr";
    url += "&v3=RESOLVED%2CVERIFIED%2CCLOSED";
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
    url += '&f8=CP';
    linkUrls.otr = url;

    // CDR link URL
    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);
    url += getBugzillaMaxDateQuery();
    url += "&f3=setters.login_name";
    url += "&o3=notequals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";
    url += "&f4=bug_status";
    url += "&o4=anywordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
    if (NeedInfoConfig.ignoremyni) {
      url += "&f5=setters.login_name";
      url += "&o5=notequals";
      url += "&v5=" + id;
    }
    linkUrls.cdr = url;

    // ONB link URL
    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);
    url += getBugzillaMaxDateQuery();
    url += "&f3=setters.login_name";
    url += "&o3=equals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";
    url += "&f4=bug_status";
    url += "&o4=nowordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
    linkUrls.onb = url;

    // CNB link URL
    url = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      url += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    url += NeedInfoConfig.fields_query.replace("{id}", id);
    url += getBugzillaMaxDateQuery();
    url += "&f3=setters.login_name";
    url += "&o3=equals";
    url += "&v3=release-mgmt-account-bot%40mozilla.tld";
    url += "&f4=bug_status";
    url += "&o4=anywordssubstr";
    url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
    linkUrls.cnb = url;

    /////////////////////////////////////////////////////////
    // Single combined AJAX query — fetches all needinfo? bugs for this
    // developer with enough fields to bucket client-side (1 request instead of 5)
    /////////////////////////////////////////////////////////

    let combinedUrl = NeedInfoConfig.bugzilla_search_url;
    if (NeedInfoConfig.api_key.length) {
      combinedUrl += "api_key=" + NeedInfoConfig.api_key + "&";
    }
    combinedUrl += "f1=requestees.login_name&o1=equals&v1=" + id;
    combinedUrl += "&f2=flagtypes.name&o2=equals&v2=needinfo%3F";
    combinedUrl += "&include_fields=id,status,flags,cf_tracking_firefox_nightly,cf_tracking_firefox_beta,cf_tracking_firefox_release";
    combinedUrl += getBugzillaMaxDateQuery();

    retrieveInfoFor(combinedUrl, id, elementIndex, developer, linkUrls);
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
function retrieveInfoFor(url, id, elementIndex, developer, linkUrls) {
  $.ajax({
    url: url,
    success: function (data) {
      processAllCountsFor(id, elementIndex, developer, linkUrls, data);
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

// Bucket all bugs from the combined query into the 5 categories client-side,
// then render each cell. Called once per developer instead of 5 times.
function processAllCountsFor(id, elementIndex, developer, linkUrls, data) {
  const NAGBOT = 'release-mgmt-account-bot@mozilla.tld';
  const CLOSED = ['RESOLVED', 'VERIFIED', 'CLOSED'];
  const devEmail = decodeURIComponent(id);
  let counts = { odr: 0, otr: 0, cdr: 0, onb: 0, cnb: 0 };

  for (let bug of (data.bugs || [])) {
    let isClosed = CLOSED.includes(bug.status);
    let isTracked = bug.cf_tracking_firefox_nightly === '+' ||
                    bug.cf_tracking_firefox_beta    === '+' ||
                    bug.cf_tracking_firefox_release === '+';
    // prevent double-counting if a bug has multiple NI flags for this dev
    let seen = new Set();

    for (let flag of (bug.flags || [])) {
      if (flag.name !== 'needinfo' || flag.status !== '?') continue;
      if (flag.requestee !== devEmail) continue;

      let isNagbot = flag.setter === NAGBOT;
      let isSelf   = flag.setter === devEmail;

      if (!isClosed) {
        if (isNagbot) {
          if (!seen.has('onb')) { counts.onb++; seen.add('onb'); }
        } else if (!isSelf || !NeedInfoConfig.ignoremyni) {
          if (!seen.has('odr')) { counts.odr++; seen.add('odr'); }
        }
        if (isTracked && !seen.has('otr')) { counts.otr++; seen.add('otr'); }
      } else {
        if (isNagbot) {
          if (!seen.has('cnb')) { counts.cnb++; seen.add('cnb'); }
        } else if (!isSelf || !NeedInfoConfig.ignoremyni) {
          if (!seen.has('cdr')) { counts.cdr++; seen.add('cdr'); }
        }
      }
    }
  }

  PageStats.devOpen   += counts.odr;
  PageStats.tracked   += counts.otr;
  PageStats.devClosed += counts.cdr;
  PageStats.nagOpen   += counts.onb;
  PageStats.nagClosed += counts.cnb;
  populatePageStats();

  displayCellFor(id, elementIndex, 'odr', counts.odr, linkUrls.odr);
  displayCellFor(id, elementIndex, 'otr', counts.otr, linkUrls.otr);
  displayCellFor(id, elementIndex, 'cdr', counts.cdr, linkUrls.cdr);
  displayCellFor(id, elementIndex, 'onb', counts.onb, linkUrls.onb);
  displayCellFor(id, elementIndex, 'cnb', counts.cnb, linkUrls.cnb);
}

function displayCellFor(id, elementIndex, type, ni_count, linkUrl) {
  let tabTarget = NeedInfoConfig.targetnew ? "buglists" : "_blank";

  let cell = el('div', { cls: 'report-' + type, id: 'data_' + elementIndex });
  if (ni_count != 0) {
    let dash_link = "details.html?" + "&userquery=" + type + "&userid=" + id + getMaxDateParameter();
    let bug_list = restToQueryUrl(linkUrl);
    let container = el('div', { cls: 'bug-link-container' });
    container.appendChild(el('a', { cls: 'bug-link', title: 'Needinfo Details', href: dash_link, target: 'nilist', text: '' + ni_count }));
    container.appendChild(el('a', { cls: 'bug-icon', title: 'Bugzilla Bug List', href: bug_list, target: tabTarget }, [
      el('img', { src: 'images/favicon.ico' })
    ]));
    cell.appendChild(container);
  } else {
    cell.appendChild(document.createTextNode('\u00A0'));
  }

  let placeholder = document.getElementById('data_' + type + '_' + elementIndex);
  if (placeholder.classList.contains('row-even')) cell.classList.add('row-even');
  else if (placeholder.classList.contains('row-odd')) cell.classList.add('row-odd');
  placeholder.parentNode.replaceChild(cell, placeholder);
}

function settingsUpdated() {
  checkConfig();
  refreshList(null);
}

function checkConfig() {
  let noKey = !NeedInfoConfig.api_key || NeedInfoConfig.api_key.length == 0;
  document.getElementById('settings-button-container').classList.toggle('alert', noKey);
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

var SearchTimeoutId = -1;
function onInputForBugzillaUser(element) {
  clearTimeout(SearchTimeoutId);
  SearchTimeoutId = setTimeout(function () {
    searchForNick(element);
  }, 750);
}
