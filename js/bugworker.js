/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


//
// Currently not in use.
//

let WorkerActive = false;

function updateAfterError(bugid, text) {
  postMessage({
    'message': 'error',
    'bugid': bugid,
    'text': text
  });
}

function updateAfterChanges(bugid) {
  postMessage({
    'message': 'change',
    'bugid': bugid
  });
}

function actionComplete() {
  postMessage({ 'message': 'complete'});
  WorkerActive = false;
}

/*
function submitCommand(url, bugId, jsonData) {
  console.log("submitting changes to bugzilla:", bugId, url, jsonData);
  CommandsSubmitted += 1;
  $.ajax({
    url: url,
    type: 'PUT',
    data: jsonData,
    contentType: "application/json",
    success: function (data) {
      CommandsSubmitted -= 1;

      // success response 
      // Object { message: null, error: true, documentation: "http://www.bugzilla.org/docs/4.2/en/html/api/", code: 100500 }
      if (data && data.error) {
        console.log("bugzilla error on request:", data.code, "bug id:", bugId);
        updateAfterError(bugId, 'error code:' + data.code);
      } else {
        updateAfterChanges(bugId);
      }

      if (!CommandsSubmitted) {
        actionComplete();
      }
    }
  }).error(function (jqXHR, textStatus, errorThrown) {
      CommandsSubmitted -= 1;

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

      if (!CommandsSubmitted) {
        actionComplete();
      }
    });
}
*/

function submitCommand(url, bugId, jsonData) {
  let xhr = new XMLHttpRequest();
  xhr.open("PUT", url, false);
  xhr.setRequestHeader('Content-type', 'application/json');
  xhr.onload = function () {
      //postMessage(xhr.responseText);
  };
  xhr.send(jsonData);
}

onmessage = (event) => {
  let data = event.data;
  if (!data.length) {
    return;
  }
  if (WorkerActive) {
    return;
  }
  WorkerActive = true;

  data.forEach(function (bug) {
    console.log(timer, bug.bugid, bug.url, bug.json);
    submitCommand(bug.url, bug.bugid, bug.json);
  });
}
