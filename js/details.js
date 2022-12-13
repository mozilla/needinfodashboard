/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NeedInfoConfig = null;
var bugset = [];

// buttons that get enabled only when there is an api key saved.
var buttons = ['button-clear', 'button-clearcmt', 'button-redir', 'button-redirassignee'];

// list of bugs we are submitting changes for.
var ChangeListSize = 0;
var ChangeList = [];

// Testing progress
var ChangeListTest = false;
var TestDelay;

$(document).ready(function () {
  loadList();
});

function loadList() {
  let team = getTeam();

  if (team == undefined) {
    console.log("missing team url parameter.")
    return;
  }

  $.getJSON('js/' + team + '.json', function (data) {
    main(data);
  });
}

function main(json)
{
  NeedInfoConfig = json.needinfo;
  // If requested via the json config file, point all queries at
  // a bugzilla test instance. 
  if (NeedInfoConfig.use_test_domain) {
    NeedInfoConfig.bugzilla_search_url =
      NeedInfoConfig.bugzilla_search_url.replace(NeedInfoConfig.bugzilla_domain, NeedInfoConfig.bugzilla_test_domain);
    NeedInfoConfig.bugzilla_put_url =
      NeedInfoConfig.bugzilla_put_url.replace(NeedInfoConfig.bugzilla_domain, NeedInfoConfig.bugzilla_test_domain);
    console.log("Bugzilla target:", NeedInfoConfig.bugzilla_test_domain);
  } else {
    console.log("Bugzilla target:", NeedInfoConfig.bugzilla_domain);
  }

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
  if (NeedInfoConfig.api_key.length) {
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
      displayBugs(url, userQuery, data);
    }
  })
  .error(function (jqXHR, textStatus, errorThrown) {
    console.log("status:", textStatus);
    console.log("error thrown:", errorThrown);
    console.log("response text:", jqXHR.responseText);
  });
}

function displayBugs(url, type, data) {
  data.bugs.forEach(function (bug) {
    // TODO: there may be multiple NIs to same dev here, which
    // we currently do not detect. We could walk flags and add 
    // entries for each (by duplicating bugs entries in the list?).
    let flagCreationDate = bug.flags[0].creation_date;
    let flagId = bug.flags[0].id;

    if (bug.flags.length > 1) {
      let index = 0;
      console.log('Additional NIs for bug ', bug.id, ' -')
      bug.flags.forEach(function (flag) {
        console.log(index, flag.creation_date, flag.name, flag.setter);
        index++;
      });
    }

    let index = 0;
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
      processRow(flagCreationDate, bug.id, flagId, bug.assigned_to, bug.severity,
        bug.priority, bug.flags[0].setter, "", bug.summary);
    } else {
      processRow(flagCreationDate, bug.id, flagId, bug.assigned_to, bug.severity,
        bug.priority, bug.flags[0].setter, bug.comments[commentIdx].text, bug.summary);
    }
  });
  dateSort();
}

function addRec(ct, bugId, flagId, assignee, s, p, from, msg, title) {
  let record = {
    'date': ct, // NI Date
    'bugid': bugId,
    'flagid': flagId,
    'assignee': assignee,
    'title': title,
    'severity': s,
    'priority': p,
    'nisetter': from,
    'msg': msg
  };
  bugset.push(record);
  return record;
}

function processRow(ct, bugId, flagId, assignee, s, p, from, msg, title) {
  let d = new Date(Date.parse(ct));

  // comment simplification steps
  let msgClean = msg;
  let clipIdx = msg.indexOf('For more information');
  if (clipIdx != -1)
    msgClean = msg.substring(0, clipIdx);

  addRec(d, bugId, flagId, assignee, s, p, from, msgClean, title);
}

function prepPage(userQuery) {
  let header =
    "<div class='name-checkbox'></div>" +
    "<div class='name-nidate-hdr' onclick='dateSort();'>NI Date</div>" +
    "<div class='name-bugid-hdr' onclick='bugIdSort();'>Bug ID</div>" +
    "<div class='name-nifrom'>NI From</div>" +
    "<div class='name-assignee'>Assignee</div>" +
    "<div class='name-severity-hdr' onclick='severitySort();'>Sev</div>" +
    "<div class='name-priority-hdr' onclick='prioritySort();'>Pri</div>" +
    "<div class='name-bugtitle'>Title</div>" +
    "<div class='name-nimsg'>NI Message</div>";
  $("#report").append(header);

  $("#title").text('Need Info Details for ' + getUserId());
}

function populateRow(record) {
  const options = { dateStyle: 'medium' };
  let dateStr = record.date.toLocaleDateString(undefined, options);
  let tabTarget = NeedInfoConfig.targetnew ? "nidetails" : "_blank";
  let bugLink = "<a target='" + tabTarget + "' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" + record.bugid + "'>" + record.bugid + "</a>";
  let titleLink = "<a class='nodecoration' target='" + tabTarget + "' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" +
    record.bugid + "'>" + record.title + "</a>";
  let commentLink = "<a class='nodecoration' target='" + tabTarget + "' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" +
    record.bugid + "#c" + record.cidx + "'>" + record.msg + "</a>";
  let assignee = trimAddress(record.assignee);
  let setter = trimAddress(record.nisetter);
  let content =
    "<div class='name-checkbox'><input type='checkbox' onclick='checkClick(this);' id='check-" + record.bugid + "'/></div>" +
    "<div class='name-nidate'>" + dateStr + "</div>" +
    "<div class='name-bugid'>" + bugLink + "</div>" +
    "<div class='name-nifrom'>" + setter + "</div>" +
    "<div class='name-assignee'>" + assignee + "</div>" +
    "<div class='name-severity'>" + record.severity + "</div>" +
    "<div class='name-priority'>" + record.priority + "</div>" +
    "<div class='name-bugtitle'>" + titleLink + "</div>" +
    "<div class='name-nimsg'>" + commentLink + "</div>";
  $("#report").append(content);
}

function clearRows() {
  $("#report").empty();
}

function populateRows() {
  bugset.forEach(function (rec) {
    populateRow(rec);
  });
  $("#stats").text("" + bugset.length + " Bugs");
  updateButtonsState();
}

function refreshList(e) {
  if (e) {
    e.preventDefault();
  }
  bugset = [];
  sortTrack['date'] = true;
  clearRows();
  loadList();
}

var sortTrack = {
  'date': true,
  'bugid': true,
  'severity': true,
  'priority': true,
};

/* column title click handlers */

function dateSort() {
  if (sortTrack['date']) {
    bugset.sort(sortDateAsc);
  } else {
    bugset.sort(sortDateDesc);
  }
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
  sortTrack['priority'] = !sortTrack['priority'];

  clearRows();
  prepPage();
  populateRows();
}

function settingsUpdated() {
  refreshList(null);
}

function updateButtonState(enable) {
  if (!NeedInfoConfig.api_key.length)
    enabled = false;

  buttons.forEach(function (button) {
    document.getElementById(button).disabled = !enable;
  });
}

function updateButtonsState() {
  let list = getCheckedBugs();
  updateButtonState(list.length > 0);
}

function getCheckedBugs() {
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

function submitInfoFor(url, bugId, jsonData) {
  $.ajax({
    url: url,
    type: 'PUT',
    data: jsonData, // "name=John&location=Boston",
    contentType: "application/json",
    success: function (data) {
      updateAfterChanges(bugId);
    }
  }).error(function (jqXHR, textStatus, errorThrown) {
      console.log("status:", textStatus);
      console.log("error thrown:", errorThrown);
      console.log("response text:", jqXHR.responseText);
    });
}

function submitChanges(type, bugId, comment) {
  // change types:
  //  clear-flag
  //  clear-flag-comment

  let data = null;
  let bug = getBugRec(bugId);
  if (bug == null) {
    console.log("Bug id not found in dataset! Something went wrong.");
    return;
  }

  if (ChangeListTest) {
    setTimeout(function () {
      updateAfterChanges(bugId);
    }, TestDelay);
    TestDelay += 750;
    return;
  }

  // https://bugzilla.readthedocs.io/en/latest/api/core/v1/bug.html#update-bug
  // rest PUT to /rest/bug/(id_or_alias)
  // flag change object: flag id, status='X' to clear
  // comment
  //'comment': {
  //  'body': '',
  //    },

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
  }
  let json = JSON.stringify(data);
  let url = NeedInfoConfig.bugzilla_put_url.replace('{id}', bug.bugid);
  if (NeedInfoConfig.api_key.length) {
    url += "?api_key=" + NeedInfoConfig.api_key;
  }
  console.log("submitting changes to bugzilla:", url, json);
  submitInfoFor(url, bugId, json);
}

function updateStatus(percent) {
  let style = Math.ceil(percent) + '%';
  console.log(style);
  document.getElementById('status').style.visibility = 'visible';
  document.getElementById('status').style.backgroundSize = style;
}

function updateStatusText() {
  document.getElementById('status').textContent = ChangeList.length + " responses pending..";
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

function invokeClearNI() {
  ChangeList = getCheckedBugs();
  if (!ChangeList.length)
    return;
  document.getElementById('prompt-confirm-bugcount').textContent = ChangeList.length;

  // Temporarily disable buttons while we submit changes
  updateButtonState(false);

  ChangeListSize = ChangeList.length;

  // Show status
  updateStatus(0);
  updateStatusText();

  TestDelay = 1000;

  let dlg = document.getElementById("prompt-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {
      ChangeList.forEach(function (bugid) {
        submitChanges('clear-flag', bugid, null);
      });
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}

function invokeClearNIWithComment() {
  // prompt-comment-confirm
  ChangeList = getCheckedBugs();
  if (!ChangeList.length)
    return;
  document.getElementById('prompt-comment-confirm-bugcount').textContent = ChangeList.length;

  // Temporarily disable buttons while we submit changes
  updateButtonState(false);

  ChangeListSize = ChangeList.length;

  // Show status
  updateStatus(0);
  updateStatusText();

  TestDelay = 1000;

  let dlg = document.getElementById("prompt-comment-confirm");
  dlg.returnValue = "cancel";
  dlg.addEventListener('close', (event) => {
    if (dlg.returnValue == 'confirm') {

      let comment = document.getElementById("prompt-comment-confirm-comment").value;
      console.log('comment:', comment);

      ChangeList.forEach(function (bugid) {
        submitChanges('clear-flag', bugid, comment);
      });
    } else {
      // Update buttons after cancel
      updateButtonsState();
    }
  }, { once: true });
  dlg.show();
}