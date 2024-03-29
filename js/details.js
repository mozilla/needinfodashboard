/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NeedInfoConfig = null;
var bugset = [];

// buttons that get enabled only when there is an api key saved.
var buttons = ['button-clear', 'button-clearcmt',
  'button-redir', 'button-redirassignee', 'button-redirsetter'];

// list of bugs we are submitting changes for.
var ChangeListSize = 0;
var ChangeList = [];

// Testing the progress. Set to true to simulate submitting bug changes.
var ChangeListTest = false;
var TestDelay;

$(document).ready(function () {
  loadList();
});

function loadList() {
  let jsonUrl = 'js/config.json';
  $.getJSON(jsonUrl, function (configdata) {
    main(configdata);
  }).fail(function (jqXHR, textStatus, errorThrown) {
    console.log("getJSON call failed for some reason.", jsonUrl, errorThrown)
  });
}

function main(json)
{
  NeedInfoConfig = json.bugzillaconfig;
  NeedInfoConfig.developers = {};

  updateDomains();

  // user bugzilla id
  var userId = getUserId();
  if (userId == undefined) {
    console.log("missing user id url parameter.")
    return;
  }

  // odr, cdr, onb, cnb
  var userQuery = getUserQuery();
  if (userQuery == undefined) {
    console.log("missing user query url parameter.")
    return;
  }

  loadSettingsInternal();
  updateButtonsState();
  prepPage(userQuery);

  let id = encodeURIComponent(getUserId());

  //////////////////////////////////////////
  // Base query and resulting fields request
  //////////////////////////////////////////

  // v1={id}
  // o1=equals
  // f1=requestees.login_name

  // f2=flagtypes.name
  // o2=equals
  // v2=needinfo?

  let url = NeedInfoConfig.bugzilla_search_url;
  if (NeedInfoConfig.api_key.length > 0) {
    url += "api_key=" + NeedInfoConfig.api_key + "&";
  }
  url += NeedInfoConfig.bugs_query.replace("{id}", id);

  switch (userQuery) {
    //////////////////////////////////////////
    // Open Developer Related
    //////////////////////////////////////////
    case 'odr':
      url += "&f3=setters.login_name";
      url += "&o3=nowordssubstr";
      url += "&v3=release-mgmt-account-bot%40mozilla.tld";

      // Ignore needinfos set by the account we're querying for.
      if (NeedInfoConfig.ignoremyni) {
        url += "," + id;
      }

      url += "&f4=bug_status";
      url += "&o4=nowordssubstr";
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
      break;

    /////////////////////////////////////////////////////////
    // Open and Tracked
    // Query uses the generic tag names that bugzilla maps
    // to the current version tags.
    /////////////////////////////////////////////////////////
    case 'otr':

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
    break;

    //////////////////////////////////////////
    // Closed Developer Related
    //////////////////////////////////////////
    case 'cdr':
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
      break;

    //////////////////////////////////////////
    // Open Nagbot
    //////////////////////////////////////////
    case 'onb':
      url += "&f3=setters.login_name";
      url += "&o3=equals";
      url += "&v3=release-mgmt-account-bot%40mozilla.tld";

      url += "&f4=bug_status";
      url += "&o4=nowordssubstr";
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
      break;

    //////////////////////////////////////////
    // Closed Nagbot
    //////////////////////////////////////////
    case 'cnb':
      url += "&f3=setters.login_name";
      url += "&o3=equals";
      url += "&v3=release-mgmt-account-bot%40mozilla.tld";

      url += "&f4=bug_status";
      url += "&o4=anywordssubstr";
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED";
      break;
  }

  retrieveInfoFor(url, userQuery);
}

function retrieveInfoFor(url, userQuery)
{
  $.ajax({
    url: url,
    success: function (data) {
      populateBugs(url, userQuery, data);
      sortByDefault();
    }
  })
  .error(function (jqXHR, textStatus, errorThrown) {
    console.log("status:", textStatus);
    console.log("error thrown:", errorThrown);
    console.log("response text:", jqXHR.responseText);
    let info = JSON.parse(jqXHR.responseText);
    let text = info.message ? info.message : errorThrown;
    errorMsg(text);
  });
}

function populateBugs(url, type, data) {
  data.bugs.forEach(function (bug) {
    // console.log(bug);
    // console.log("flags", bug.flags);
    
    /*
    creation_date: "2021-03-30T16:47:15Z"
    id: 2037178
    modification_date: "2021-03-30T16:47:15Z"
    name: "needinfo"
    requestee: "aosmond@mozilla.com"
    setter: "aryx.bugmail@gmx-topmail.de"
    status: "?"
    type_id: 800
    */

    // Grab the first needinfo id for this user. This is not perfect since
    // we can have multiple. If the user clears an ni using the helpers in
    // this page, only the first will get cleared. Maybe we can fix this up
    // later.
    let id = getUserId();
    let flagId, flagCreationDate, flagIdx = -1;
    for (let idx = 0; idx < bug.flags.length; idx++) {
      if (bug.flags[idx].name != 'needinfo') 
        continue;
      if (bug.flags[idx].requestee == id) {
        flagCreationDate = bug.flags[idx].creation_date;
        flagId = bug.flags[idx].id;
        flagIdx = idx;
        break;
      }
    }

    if (flagIdx == -1) {
      errorMsg("Didn't find a flag that matched a needinfo we were looking for?? Bailing.");
      return true;
    }

    index = 0;
    let commentIdx = -1;
    bug.comments.every(function (comment) {
      if (flagCreationDate == comment.creation_time) {
        // when someone sets an ni without commenting, there won't be a comment to match here.
        // usually the right comment is the previous in the array (they forgot to set the ni when
        // submitting a comment) but lets not mess around with false positives here. leave it blank.
        //console.log(index, comment.creation_time, comment.creator);
        commentIdx = index;
        return false;
      }
      index++;
      return true;
    });

    if (commentIdx == -1) {
      processRow(flagCreationDate, bug.id, flagId, flagIdx, bug.assigned_to, bug.severity,
        bug.priority, bug.op_sys, bug.flags, "", 0, bug.summary);
    } else {
      processRow(flagCreationDate, bug.id, flagId, flagIdx, bug.assigned_to, bug.severity,
        bug.priority, bug.op_sys, bug.flags, bug.comments[commentIdx].text, bug.comments[commentIdx].count, bug.summary);
    }
  });
}

function addRec(ct, bugId, flagId, flagIdx, assignee, s, p, platform, msg, cmtIdx, title, flags) {
  let record = {
    'date': ct, // NI Date
    'bugid': bugId,
    'flagid': flagId,
    'flagidx': flagIdx,
    'assignee': assignee,
    'title': title,
    'severity': s,
    'priority': p,
    'platform': platform,
    'flags': flags,
    'msg': msg,
    'commentid': cmtIdx
  };
  bugset.push(record);
  return record;
}

function processRow(ct, bugId, flagId, flagIdx, assignee, s, p, platform, flags, msg, cmtIdx, title) {
  // flagId is the bugzilla flagid of the ni that set this user's ni. We use it
  // in comment links.

  let d = new Date(Date.parse(ct));

  // comment simplification steps
  let msgClean = msg;
  let clipIdx = msg.indexOf('For more information');
  if (clipIdx != -1) {
    msgClean = msg.substring(0, clipIdx);
  }

  if (platform == 'Unspecified')
    platform = '';

  addRec(d, bugId, flagId, flagIdx, assignee, s, p, platform, msgClean, cmtIdx, title, flags);
}

function prepPage(userQuery) {
  let header =
    "<div class='name-checkbox'></div>" +
    "<div class='name-nidate-hdr' onclick='dateSort();'>NI Date</div>" +
    "<div class='name-bugid-hdr' onclick='bugIdSort();'>Bug ID</div>" +
    "<div class='name-nifrom'>NeedInfo</div>" +
    "<div class='name-assignee'>Assignee</div>" +
    "<div class='name-severity-hdr' onclick='severitySort();'>Sev</div>" +
    "<div class='name-priority-hdr' onclick='prioritySort();'>Pri</div>" +
    "<div class='name-platform-hdr'>OS</div>" +
    "<div class='name-bugtitle'>Title</div>" +
    "<div class='name-nimsg'>NI Message</div>";
  $("#report").append(header);

  let textHdr = '';
  // odr, cdr, onb, cnb
  var userQuery = getUserQuery();
  switch (userQuery) {
    case 'odr':
    textHdr = 'Open Dev Related'
    break;
    case 'cdr':
    textHdr = 'Closed Dev Related'
    break;
    case 'onb':
    textHdr = 'Open Nag Bot'
    break;
    case 'cnb':
    textHdr = 'Closed Nag Bot'
    break;
  }

  $("#title").text(textHdr + ' Details for ' + getUserId());
}

function populateRow(record) {
  const options = { dateStyle: 'medium' };
  let bugUrl = NeedInfoConfig.bugzilla_link_url.replace('{id}', record.bugid);
  let dateStr = record.date.toLocaleDateString(undefined, options);
  let tabTarget = NeedInfoConfig.targetnew ? "nidetails" : "_blank";
  let bugLink = "<a target='" + tabTarget + "' href='" + bugUrl + "'>" + record.bugid + "</a>";
  let titleLink = "<a class='nodecoration' target='" + tabTarget + "' href='" + bugUrl + "'>" + record.title + "</a>";
  let commentLink = "<a class='nodecoration' target='" + tabTarget + "' href='" + bugUrl + "#c" + record.commentid + "'>" + record.msg + "</a>";
  let assignee = trimAddress(record.assignee);

  let index = -1, first = true;
  let flagText = '';
  let extraFlagText = '';
  record.flags.forEach(function (flag) {
    index++;
    if (flag.name != 'needinfo') 
      return true;
    if (record.flagidx == index) {
      flagText = trimAddress(flag.setter) + '<br/>';
    } else {
      if (first) {
        first = false;
        extraFlagText = "<br/>additional nis:<br/>";
      }
      extraFlagText += trimAddress(flag.setter) + ' &rArr; ' + trimAddress(flag.requestee) + '<br/>';
    }
  });

  let content =
    "<div class='name-checkbox'><input type='checkbox' onclick='checkClick(this);' id='check-" + record.bugid + "'/></div>" +
    "<div class='name-nidate'>" + dateStr + "</div>" +
    "<div class='name-bugid'>" + bugLink + "</div>" +
    "<div class='name-nifrom'>" + flagText + "<span class='name-nifromadd'>" + extraFlagText + "</span></div>" +
    "<div class='name-assignee'>" + assignee + "</div>" +
    "<div class='name-severity'>" + record.severity + "</div>" +
    "<div class='name-priority'>" + record.priority + "</div>" +
    "<div class='name-platform'>" + record.platform + "</div>" +
    "<div class='name-bugtitle'>" + titleLink + "</div>" +
    "<div class='name-nimsg'>" + commentLink + "</div>";
  $("#report").append(content);
}

function checkConfig() {
  if (NeedInfoConfig.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}

// Called from Settings util functions after settings are updated.
function settingsUpdated() {
  checkConfig();
  refreshList(null);
}

function clearRows() {
  $("#report").empty();
  $("#errors").empty();
}

function errorMsg(text) {
  $("#errors").append(text);
}

function populateRows() {
  document.getElementById('progress').style.visibility = 'hidden';
  bugset.forEach(function (rec) {
    populateRow(rec);
  });
  $("#stats").text("" + bugset.length + " Bugs");
  updateButtonsState();
  checkConfig();
}

function refreshList(e) {
  if (e) {
    e.preventDefault();
  }
  bugset = [];
  clearRows();
  loadList();
}

var sortTrack = {
  'date': true,
  'bugid': true,
  'severity': true,
  'priority': true,
};

function updateDefaultSortSettings(type, order) {
  saveDefaultSortSettings(type, sortTrack[type]);
}

function sortByDefault() {
  let results = getDefaultSortSettings();
  let type = 'date';
  if (results.sort != null && results.order != null) {
    type = results.sort;
    sortTrack[type] = results.order == 'true' ? true:false;
  }

  saveDefaultSortSettings(type, sortTrack[type]);

  switch (type) {
    case 'date':
      dateSort();
    break;
    case 'bugid':
      bugIdSort();
    break;
    case 'severity':
      severitySort();
    break;
    case 'priority':
      prioritySort();
    break;
  };
}

/* column title click handlers */

function dateSort() {
  if (sortTrack['date']) {
    bugset.sort(sortDateAsc);
  } else {
    bugset.sort(sortDateDesc);
  }
  updateDefaultSortSettings('date', sortTrack['date']);
  sortTrack['date'] = !sortTrack['date'];

  clearRows();
  prepPage();
  populateRows();
}

function bugIdSort() {
  if (sortTrack['bugid']) {
    bugset.sort(sortBugIdAsc);
  } else {
    bugset.sort(sortBugIdDesc);
  }
  updateDefaultSortSettings('bugid', sortTrack['bugid']);
  sortTrack['bugid'] = !sortTrack['bugid'];

  clearRows();
  prepPage();
  populateRows();
}

function severitySort() {
  if (sortTrack['severity']) {
    bugset.sort(sortSeverityAsc);
  } else {
    bugset.sort(sortSeverityDesc);
  }
  updateDefaultSortSettings('severity', sortTrack['severity']);
  sortTrack['severity'] = !sortTrack['severity'];

  clearRows();
  prepPage();
  populateRows();
}

function prioritySort() {
  if (sortTrack['priority']) {
    bugset.sort(sortPriorityAsc);
  } else {
    bugset.sort(sortPriorityDesc);
  }
  updateDefaultSortSettings('priority', sortTrack['priority']);
  sortTrack['priority'] = !sortTrack['priority'];

  clearRows();
  prepPage();
  populateRows();
}

function updateButtonState(enabled) {
  buttons.forEach(function (button) {
    document.getElementById(button).disabled = !enabled;
  });
}

function updateButtonsState() {
  let list = getCheckedBugIds();
  let enabled = list.length > 0;
  if (NeedInfoConfig.api_key.length == 0) {
    enabled = false;
  }
  // blanket update all buttons
  updateButtonState(enabled);

  // XXX Special case due to the spam issue when submitting
  // comments - only enable the clear w/comment when we have
  // one check box checked.
  if (enabled) {
    document.getElementById('button-clearcmt').disabled = !(list.length == 1);
  }
}

// Always returns a valid list
function getCheckedBugIds() {
  let list = [];
  bugset.every(function (bug) {
    let checkBox = document.getElementById('check-' + bug.bugid);
    if (checkBox == null) {
      console.log('Mismatched check boxes with bug ids, something is messed up. Bailing.');
      list = [];
      return false;
    }
    if (checkBox.checked) {
      list.push(bug.bugid);
    }
    return true;
  });
  return list;
}

function clearCheckedBugs() {
  let list = getCheckedBugIds();
  list.forEach(function (bugId) {
    let checkBox = document.getElementById('check-' + bugId);
    if (checkBox != null) {
      checkBox.checked = false;
    }
  });
}

function checkClick(e) {
  updateButtonsState();
}

function getBugRec(bugId) {
  let record = null;
  bugset.every(function (rec) {
    if (rec.bugid == bugId) {
      record = rec;
      return false;
    }
    return true;
  });
  return record;
}

function submitCommand(url, bugId, jsonData) {
  console.log("submitting changes to bugzilla:", bugId);
  $.ajax({
    url: url,
    type: 'PUT',
    data: jsonData,
    contentType: "application/json",
    success: function (data) {
      // success response 
      // Object { message: null, error: true, documentation: "http://www.bugzilla.org/docs/4.2/en/html/api/", code: 100500 }
      if (data && data.error) {
        console.log("bugzilla error on request:", data.code, "bug id:", bugId);
        updateAfterError(bugId, 'error code:' + data.code);
      } else {
        updateAfterChanges(bugId);
      }
    }
  }).error(function (jqXHR, textStatus, errorThrown) {
      console.log("status:", textStatus);
      console.log("error thrown:", errorThrown);
      console.log("response text:", jqXHR.responseText);
      try {
        let info = JSON.parse(jqXHR.responseText);
        let text = info.message ? info.message : errorThrown;
        updateAfterError(bugId, text);
        return;
      } catch(e) {
      }
      updateAfterError(bugId, errorThrown);
    });
}

// attempting to get around spam blocking with duplicate comments. Didn't work.
function submitCommands() {
  let timer = 100;
  let bug = PendingPuts.pop();
  while (bug != undefined) {
    //console.log(timer, bug.bugid, bug.url, bug.json);
    setTimeout(function (bug) {
      submitCommand(bug.url, bug.bugid, bug.json);
    }, timer, bug);
    timer += 10;
    bug = PendingPuts.pop();
  }
}

function clearPendingCommands() {
  // Clear sequence of commands
  PendingPuts = [];
}

function queueCommand(url, bugId, json) {
  PendingPuts.push({'url': url, 'bugid': bugId, 'json': json});
}

function queueBugChange(type, bugId, comment, to) {
  // change types:
  //  clear-flag        - valid params: none
  //  redirect-flag     - valid params: comment
  //  redirect-flag-to  - valid params: comment, to

  let data = null;
  let bug = getBugRec(bugId);
  if (bug == null) {
    console.log("Bug id not found in dataset! Something went wrong.");
    return;
  }

  // Testing UI progress meter for multiple bug changes
  if (ChangeListTest) {
    if (ChangeListSize == ChangeList.length) {
      TestDelay = 1000;
    }
    setTimeout(function () {
      updateAfterChanges(bugId);
    }, TestDelay);
    TestDelay += 750;
    return;
  }

  // https://bugzilla.readthedocs.io/en/latest/api/core/v1/bug.html#update-bug
  if (type == 'clear-flag') {
    data = {
      'flags': [{
        'id': bug.flagid,
        'status': 'X'
      }]
    };
    if (comment != null) {
      data.comment = {
        'body': comment
      };
    }
  } else if (type == 'redirect-flag') {
    // redirect to setter with a comment
    data = {
      'flags': [{
        'id': bug.flagid,
        'status': 'X'
      },
      {
        'name': 'needinfo',
        'status': '?',
        'requestee': bug.nisetter,
        'new': true,
        'type_id': 800
      }]
    };
    if (comment != null) {
      data.comment = {
        'body': comment
      };
    }
  } else if (type == 'redirect-flag-to') {
    // redirect to with a comment
    data = {
      'flags': [{
        'id': bug.flagid,
        'status': 'X'
      },
      {
        'name': 'needinfo',
        'status': '?',
        // doesn't work with aliases?
        'requestee': to,
        'new': true,
        'type_id': 800
      }]
    };
    if (comment != null) {
      data.comment = {
        'body': comment
      };
    }
  } else {
    console.log("unsupported action.")
    return;
  }

  let json = JSON.stringify(data);
  let url = NeedInfoConfig.bugzilla_put_url.replace('{id}', bug.bugid);
  if (NeedInfoConfig.api_key.length) {
    url += "?api_key=" + NeedInfoConfig.api_key;
  }

  queueCommand(url, bugId, json);
}

function updateStatus(percent) {
  let style = Math.ceil(percent) + '%';
  document.getElementById('status').style.visibility = 'visible';
  document.getElementById('status').style.backgroundSize = style;
}

function updateStatusText() {
  document.getElementById('status').textContent = ChangeList.length + " responses pending..";
}

function updateAfterError(bugid, text) {
  ChangeList = ChangeList.filter((value) => value != bugid);
  updateStatus(((ChangeListSize - ChangeList.length) / ChangeListSize) * 100.0);
  updateStatusText();

  errorMsg("request error for bug " + bugid + " '" + text + "'");
  errorMsg("<br/>");

  if (ChangeList.length == 0) {
    document.getElementById('status').style.visibility = 'hidden';
    clearCheckedBugs();
    updateButtonsState();
  }
}

function updateAfterChanges(bugid) {
  ChangeList = ChangeList.filter((value) => value != bugid);
  updateStatus(((ChangeListSize - ChangeList.length) / ChangeListSize) * 100.0);
  updateStatusText();

  if (ChangeList.length == 0) {
    refreshList(null);
    document.getElementById('status').style.visibility = 'hidden';
  }
}

function getRandomIntStr(max) {
  return '' + Math.floor(Math.random() * max);
}

function queueChanges(type, comment, to) {
  clearPendingCommands();

  if (!ChangeList.length)
    return;

  // Temporarily disable buttons while we submit changes
  updateButtonState(false);

  ChangeListSize = ChangeList.length;

  // Show status
  updateStatus(0);
  updateStatusText();

  ChangeList.forEach(function (bugId) {
    queueBugChange(type, bugId, comment, to);
  });

  /*
  // WIP anti-spam rejection protection
  let submittedComment = comment;
  ChangeList.forEach(function (bugId) {
    queueBugChange(type, bugId, submittedComment, to);
    if (ChangeList.length > 0 && comment.length > 0) {
      submittedComment = comment + ' (' + getRandomIntStr(1000) + ')';
    }
  });
  */

  submitCommands();
}

// prompt-confirm
// prompt-confirm-bugcount

function invokeClearNI() {
  ChangeList = getCheckedBugIds();
  if (!ChangeList.length)
    return;
  document.getElementById('prompt-confirm-bugcount').textContent = ChangeList.length;

  let dlg = document.getElementById("prompt-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      queueChanges('clear-flag', null);
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}

// prompt-comment-confirm
// prompt-comment-confirm-bugcount
// prompt-comment-confirm-comment

function invokeClearNIWithComment() {
  ChangeList = getCheckedBugIds();
  if (!ChangeList.length || ChangeList.length > 1)
    return;
  document.getElementById('prompt-comment-confirm-bugcount').textContent = ChangeList.length;

  let dlg = document.getElementById("prompt-comment-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      let comment = document.getElementById("prompt-comment-confirm-comment").value;
      if (!comment.length)
        comment = null;
      queueChanges('clear-flag', comment);
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}

// prompt-redirect-confirm
// prompt-redirect-confirm-bugcount
// prompt-redirect-confirm-comment

function invokeRedirectToSetter() {
  ChangeList = getCheckedBugIds();
  if (!ChangeList.length || ChangeList.length > 1)
    return;
  let bug = getBugRec(ChangeList[0]);
  if (bug == null)
    return;

  document.getElementById('prompt-redirect-confirm-bugcount').textContent = ChangeList.length;
  document.getElementById('prompt-setter').textContent =
    'Redirecting to: ' + trimAddress(bug.nisetter);

  let dlg = document.getElementById("prompt-redirect-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      let comment = document.getElementById("prompt-redirect-confirm-comment").value;
      if (!comment.length) {
        comment = null;
      }
      queueChanges('redirect-flag', comment);
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}

// prompt-redirect-to-confirm
// prompt-redirect-to-confirm-bugcount
// prompt-redirect-to-confirm-to
// prompt-redirect-to-confirm-comment

function invokeRedirectTo() {
  document.getElementById('autofill-user-search').disabled = true;
  document.getElementById("prompt-redirect-to-confirm-to").value = "";
  $('#autofill-user-search').empty();

  ChangeList = getCheckedBugIds();
  if (!ChangeList.length || ChangeList.length > 1)
    return;
  let bug = getBugRec(ChangeList[0]);
  if (bug == null)
    return;

  document.getElementById('prompt-redirect-to-confirm-bugcount').textContent = ChangeList.length;

  let dlg = document.getElementById("prompt-redirect-to-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      let comment = document.getElementById("prompt-redirect-to-confirm-comment").value;
      if (!comment.length) {
        comment = null;
      }
      let to = getRedirectToAccount();
      queueChanges('redirect-flag-to', comment, to);
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}

function invokeRedirectToAssignee() {
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
