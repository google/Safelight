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
goog.provide('safelight.RunnerPanelController');

goog.require('safelight.FilterManager');



/**
 * Controller for safelight.RunnerPanelDirective.
 *
 * @struct @ngInject @export @constructor
 * @param {!angular.Scope} $scope
 * @param {!Object} $cookies
 * @param {!safelight.Alerter} alerter
 * @param {!safelight.FilterManager} filterManager
 */
safelight.RunnerPanelController = function($scope,
                                           $cookies,
                                           alerter,
                                           filterManager) {
  /** @private @const {!Object} */
  this.$cookies_ = $cookies;

  /** @private @const {!safelight.Alerter} */
  this.alerter_ = alerter;

  /** @private @const {!safelight.FilterManager} */
  this.filterManager_ = filterManager;

  /** @export {number} */
  this.numThreads = 1;

  /** @export {boolean} */
  this.built = false;

  /** @export {boolean} */
  this.autoRun = true;

  /** @private {!Object<string, boolean>} */
  this.inputNames_ = {};

  /** @type {function():boolean} */
  var remover = this.filterManager_.addActiveFilterChangedListener(
      this.onActiveFilterChanged_.bind(this));
  $scope.$on('$destroy', remover);

  /** @type {function():boolean} */
  var valueRemover = this.filterManager_.addValuesChangedListener(
      this.onValuesChanged_.bind(this));
  $scope.$on('$destroy', valueRemover);

  if ($cookies.autoRun !== undefined) {
    // Ensure the cookie value is a bool, not a string
    this.autoRun = $cookies.autoRun == 'true';
  }
  if ($cookies.numThreads !== undefined) {
    // Ensure the cookie value is a number, not a string
    this.numThreads = parseInt($cookies.numThreads, 10);
  }
};


/**
 * Listener that is called when the active filter is changed
 * (though this could mean "the existing filter was rebuilt with no
 * apparent changes" in addition to "completely different filter now").
 *
 * @private
 * @param {!Array<!safelight.Argument>} args
 */
safelight.RunnerPanelController.prototype.onActiveFilterChanged_ =
    function(args) {
  this.built = (args.length > 0);
  this.inputNames_ = {};
  for (var i = 0; i < args.length; ++i) {
    /** @type {!safelight.Argument} */
    var a = args[i];
    if (a.isInput()) {
      this.inputNames_[a.name] = true;
    }
  }
};


/**
 * Listener that is called when the values for the active filter are changed
 *
 * @private
 * @param {!Object<string, ?Object|boolean|number>} values
 */
safelight.RunnerPanelController.prototype.onValuesChanged_ = function(values) {
  var run = false;
  if (this.autoRun) {
    for (var name in values) {
      if (this.inputNames_[name]) {
        run = true;
        break;
      }
    }
  }
  if (run) {
    this.run();
  }
};


/**
 * Run the active filter.
 * @export
 */
safelight.RunnerPanelController.prototype.run = function() {
  var $cookies = this.$cookies_;
  $cookies.autoRun = this.autoRun;
  $cookies.numThreads = this.numThreads;
  this.filterManager_.run(this.numThreads).then(
      function(success) {
        // nothing
      }.bind(this),
      function(failure) {
        this.alerter_.error(failure);
      }.bind(this));
};


/**
 * Auto-run the active filter if possible.
 * @export
 */
safelight.RunnerPanelController.prototype.doAutoRun = function() {
  var $cookies = this.$cookies_;
  $cookies.autoRun = this.autoRun;
  $cookies.numThreads = this.numThreads;
  if (this.autoRun && this.built) {
    this.run();
  }
};


