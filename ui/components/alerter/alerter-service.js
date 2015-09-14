/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
goog.provide('safelight.Alerter');

goog.scope(function() {

/**
 * alerter is a thin wrapper around AngularUI's 'alert'
 * widget set, provided to abstract warning/error messages for Safelight.
 *
 * alerter currently supports 'error' and 'warning' alerts. All alerts
 * shown to the user remain visible until dismissed by the user (although
 * the app can explicitly dismiss all visible alerts in some situations).
 *
 * @struct @ngInject @export @constructor
 */
safelight.Alerter = function() {
  /** @export {!Array<string>} */
  this.alerts = [];
};

/**
 * Display a warning to the user.
 * @export
 * @param {!string} msg message to show.
 */
safelight.Alerter.prototype.warning = function(msg) {
  this.alerts.push({'msg': msg, 'type': 'warning'});
};

/**
 * Display an error to the user.
 * @export
 * @param {string} msg message to show.
 */
safelight.Alerter.prototype.error = function(msg) {
  this.alerts.push({'msg': msg, 'type': 'danger'});
};

/**
 * Dismiss the alert with the given index.
 * @export
 * @param {number} index
 */
safelight.Alerter.prototype.dismiss = function(index) {
  this.alerts.splice(index, 1);
};

/**
 * Dismiss any visible alerts.
 * @export
 */
safelight.Alerter.prototype.dismissAll = function() {
  this.alerts = [];
};

});  // goog.scope
