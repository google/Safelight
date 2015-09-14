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
goog.provide('safelight.BuilderController');

goog.require('safelight.Alerter');
goog.require('safelight.Builder');



/**
 * Controller for safelight.BuilderDirective.
 *
 * @param {!safelight.Alerter} alerter
 * @param {!safelight.Builder} builder
 * @param {!angular.Scope} $scope
 * @struct @ngInject @export @constructor
 */
safelight.BuilderController = function(alerter, builder, $scope) {
  /** @private @const {!safelight.Alerter} */
  this.alerter_ = alerter;

  /** @export @const {!safelight.Builder} */
  this.builder = builder;

  /** @export {string} */
  this.buildLog = '';

  /** @export {boolean} */
  this.buildInProgress = false;
};

/**
 * Controller for safelight.BuilderDirective.
 *
 * @export
 */
safelight.BuilderController.prototype.build = function() {
  if (this.buildInProgress) {
    return;
  }
  this.buildInProgress = true;
  this.alerter_.dismissAll();
  this.builder.build().then(
    function(hash) {
      // console.log('Build Succeeded: ' + hash);
    }.bind(this),
    function(error) {
      this.alerter_.error(error);
    }.bind(this),
    function(log) {
      this.buildLog = log;
    }.bind(this)
  )
  .finally(
    function() {
      this.buildInProgress = false;
    }.bind(this)
  );

};
