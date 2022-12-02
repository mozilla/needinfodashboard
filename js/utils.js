/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function getTeam() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  //for (const [key, value] of urlParams.entries()) {
  //  console.log(`${key}, ${value}`);
  //}
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

// generate random integer in the given range
function randomNumber(min, max) { 
    return Math.round(Math.random() * (max - min) + min);
}

function getFromStorage(keyname) {
  let value = sessionStorage.getItem(keyname);
  if (value == null) {
    value = localStorage.getItem(keyname);
  }
  return value;
}

function clearStorage(keyname) {
  localStorage.removeItem(keyname);
  sessionStorage.removeItem(keyname);
}

function loadSettingsInternal() {
  let api_key = getFromStorage("api-key");
  console.log(api_key);
  NEEDINFO.api_key = (api_key == null) ? "" : api_key;

  NEEDINFO.ignoremyni = getFromStorage("ignoremyni") == (null || 'false') ? false : true;
  NEEDINFO.saveoptions = getFromStorage("save") == (null || 'false') ? false : true;
}


