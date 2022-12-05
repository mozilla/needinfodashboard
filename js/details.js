/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var NEEDINFO = null;

// http://127.0.0.1/?team=media
// http://127.0.0.1/details.html?team=media&userquery=odr&userid=docfaraday@gmail.com
$(document).ready(function () {
  let team = getTeam();

  if (team == undefined) {
    console.log("missing team url parameter.")
    return;
  }

  $.getJSON('js/' + team + '.json', function (data) {
    main(data);
  });
});

function main(json)
{
  NEEDINFO = json.needinfo;

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
  prepPage(userQuery);

  let id = encodeURIComponent(getUserId());
  let url = NEEDINFO.bugzilla_rest_url;

  //////////////////////////////////////////
  // Base query and resulting fields request
  //////////////////////////////////////////

  // v1={id}
  // o1=equals
  // f1=requestees.login_name

  // f2=flagtypes.name
  // o2=equals
  // v2=needinfo?

  if (NEEDINFO.api_key.length) {
    url += "api_key=" + NEEDINFO.api_key + "&";
  }
  url += NEEDINFO.bugs_query.replace("{id}", id);

  switch (userQuery) {
    //////////////////////////////////////////
    // Open Developer Related
    //////////////////////////////////////////
    case 'odr':
      url += "&f3=setters.login_name"
      url += "&o3=nowordssubstr"
      url += "&v3=release-mgmt-account-bot%40mozilla.tld"

      // Ignore needinfos set by the account we're querying for.
      if (NEEDINFO.ignoremyni) {
        url += "," + id;
      }

      url += "&f4=bug_status"
      url += "&o4=nowordssubstr"
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"
      break;

    //////////////////////////////////////////
    // Closed Developer Related
    //////////////////////////////////////////
    case 'cdr':
      url += "&f3=setters.login_name"
      url += "&o3=notequals"
      url += "&v3=release-mgmt-account-bot%40mozilla.tld"

      url += "&f4=bug_status"
      url += "&o4=anywordssubstr"
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"
      break;

    //////////////////////////////////////////
    // Open Nagbot
    //////////////////////////////////////////
    case 'onb':
      url += "&f3=setters.login_name"
      url += "&o3=equals"
      url += "&v3=release-mgmt-account-bot%40mozilla.tld"

      url += "&f4=bug_status"
      url += "&o4=nowordssubstr"
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"
      break;

    //////////////////////////////////////////
    // Closed Nagbot
    //////////////////////////////////////////
    case 'cnb':
      url += "&f3=setters.login_name"
      url += "&o3=equals"
      url += "&v3=release-mgmt-account-bot%40mozilla.tld"

      url += "&f4=bug_status"
      url += "&o4=anywordssubstr"
      url += "&v4=RESOLVED%2CVERIFIED%2CCLOSED"
      break;
  }

  //console.log(url);

  retrieveInfoFor(url, userQuery);
}

function retrieveInfoFor(url, type)
{
    $.ajax({
      url: url,
      success: function (data) {
        displayCountFor(url, type, data);
      }
    })
    .error(function(jqXHR, textStatus, errorThrown) {
      console.log("error " + textStatus);
      console.log("incoming Text " + jqXHR.responseText);
    });
}

function displayCountFor(url, type, data) {
  data.bugs.forEach(function (bug) {
    let flagCreationDate = bug.flags[0].creation_date;

    //let index = 0;
    //bug.flags.forEach(function (flag) {
    //  console.log(index, flag.creation_date, flag.name, flag.setter);
    //  index++;
    //});

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
      processRow(flagCreationDate, bug.id, bug.severity, bug.priority, bug.flags[0].setter, "", -1, bug.summary);
    } else {
      processRow(flagCreationDate, bug.id, bug.severity, bug.priority, bug.flags[0].setter, bug.comments[commentIdx].text, commentIdx, bug.summary);
    }
  });
  sortBugs();
  populateRows();
}

let bugset = [];

function addRec(ct, bugid, s, p, from, msg, cidx, title) {
  let record = {
    'date': ct, // Date
    'bugid': bugid,
    'title': title,
    'severity': s,
    'priority': p,
    'nisetter': from,
    'msg': msg,
    'commentId': cidx
  };
  bugset.push(record);
  return record;
}

function processRow(ct, bugid, s, p, from, msg, cidx, title) {
  let d = new Date(Date.parse(ct));

  // poster simplification
  from = from.replace('release-mgmt-account-bot@mozilla.tld', 'nagbot');

  // comment simplification
  let msgClean = msg;
  let clipIdx = msg.indexOf('For more information');
  if (clipIdx != -1)
    msgClean = msg.substring(0, clipIdx);

  addRec(d, bugid, s, p, from, msgClean, cidx, title);
}

function prepPage(userQuery) {
  let header =
    "<div class='name-checkbox'></div>" +
    "<div class='name-nidate-hdr' onclick='htmlSort(0);'>NI Date</div>" +
    "<div class='name-bugid-hdr'>Bug ID</div>" +
    "<div class='name-severity'>Severity</div>" +
    "<div class='name-priority'>Priority</div>" +
    "<div class='name-nifrom'>NI From</div>" +
    "<div class='name-bugtitle'>Title</div>" +
    "<div class='name-nimsg'>NI Message</div>";
  $("#report").append(header);

  $("#title").text('Need Info Details for ' + getUserId());
}

function populateRow(record) {
  let dateStr = record.date.toDateString();
  let bugLink = "<a target='user' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" + record.bugid + "'>" + record.bugid + "</a>";
  let titleLink = "<a class='nodecoration' target='user' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" +
    record.bugid + "'>" + record.title + "</a>";
  let commentLink = "<a class='nodecoration' target='user' href='https://bugzilla.mozilla.org/show_bug.cgi?id=" +
    record.bugid + "#c" + record.cidx + "'>" + record.msg + "</a>";
  let content =
    "<div class='name-checkbox'><input type='checkbox' id='' placeholder='Ignore' name='ignoremyni' /></div>" +
    "<div class='name-nidate'>" + dateStr + "</div>" +
    "<div class='name-bugid'>" + bugLink + "</div>" +
    "<div class='name-severity'>" + record.severity + "</div>" +
    "<div class='name-priority'>" + record.priority + "</div>" +
    "<div class='name-nifrom'>" + record.nisetter + "</div>" +
    "<div class='name-bugtitle'>" + titleLink + "</div>" +
    "<div class='name-nimsg'>" + commentLink + "</div>";
  $("#report").append(content);
}

function clearRows() {
  $("#report").empty();
  prepPage();
}

function populateRows() {
  bugset.forEach(function (rec) {
    populateRow(rec);
  });
  $("#stats").text("" + bugset.length + " Bugs");
}

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

function sortBugId(a, b) {
  return a.bugid - b.bugid;
}

let sortTrack = {
  'date': true, /* newest to oldest */
};

function sortBugs() {
  if (sortTrack['date']) {
    bugset.sort(sortDateAsc);
  } else {
    bugset.sort(sortDateDesc);
  }
  sortTrack['date'] = !sortTrack['date'];
}

function htmlSort(colId) {
  switch (colId) {
    case 0: // date
      sortBugs();
      clearRows();
      populateRows();
      break;
  }
}

/*
  {
    "summary": "Use StoragePrincipal for deviceId (and potentially QuotaManager if not used)",
      "flags": [
        {
          "creation_date": "2019-10-18T13:55:15Z",
          "requestee": "jib@mozilla.com",
          "modification_date": "2019-10-18T13:55:15Z",
          "name": "needinfo",
          "status": "?",
          "setter": "annevk@annevk.nl",
          "id": 1920605,
          "type_id": 800
        }
      ],
        "comments": [
          {
            "tags": [],
            "author": "annevk@annevk.nl",
            "id": 14432600,
            "creator": "annevk@annevk.nl",
            "time": "2019-10-18T13:55:15Z",
            "attachment_id": null,
            "creation_time": "2019-10-18T13:55:15Z",
            "text": "Per discussion with Jan-Ivar, StoragePrincipal is not used for deviceId at the moment which would allow circumventing some storage policies potentially.\n\nIn particular, if a user uses top-level A and A nested in top-level B (with B delegating permission once we have Feature Policy) the two As should probably not get to bypass StoragePrincipal separation even if they both have a WebRTC permission.",
            "raw_text": "Per discussion with Jan-Ivar, StoragePrincipal is not used for deviceId at the moment which would allow circumventing some storage policies potentially.\n\nIn particular, if a user uses top-level A and A nested in top-level B (with B delegating permission once we have Feature Policy) the two As should probably not get to bypass StoragePrincipal separation even if they both have a WebRTC permission.",
            "count": 0,
            "is_private": false,
            "bug_id": 1589685
          },
          {
            "text": "Very good point, happy to help integrate this with storage principal.",
            "creation_time": "2019-10-18T15:00:51Z",
            "attachment_id": null,
            "time": "2019-10-18T15:00:51Z",
            "bug_id": 1589685,
            "count": 1,
            "is_private": false,
            "raw_text": "Very good point, happy to help integrate this with storage principal.",
            "id": 14432708,
            "author": "ehsan.akhgari@gmail.com",
            "tags": [],
            "creator": "ehsan.akhgari@gmail.com"
          },
          {
            "creator": "achronop@gmail.com",
            "tags": [],
            "author": "achronop@gmail.com",
            "id": 14620873,
            "raw_text": "Jib, can you please follow up on the above?",
            "is_private": false,
            "count": 2,
            "bug_id": 1589685,
            "time": "2020-02-03T12:21:16Z",
            "creation_time": "2020-02-03T12:21:16Z",
            "attachment_id": null,
            "text": "Jib, can you please follow up on the above?"
          }
        ],
          "id": 1589685
  }
  */
