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
goog.provide('safelight.TimingPanelController');

goog.require('safelight.filterManager.module');



/**
 * Controller for safelight.TimingPanelDirective.
 *
 * @struct @ngInject @export @constructor
 * @param {!angular.Scope} $scope
 * @param {!safelight.FilterManager} filterManager
 */
safelight.TimingPanelController = function($scope, filterManager) {
  /** @export @type {number} */
  this.timeUsec = 0;

  /** @export @type {number} */
  this.mpixPerSec = 0;

  var listenerRemover =
      filterManager.addValuesChangedListener(function(values) {
        if (values.hasOwnProperty('$time_usec') &&
            values.hasOwnProperty('$pixels_processed')) {
          this.timeUsec = values['$time_usec'];
          var pixelsProcessed = values['$pixels_processed'];
          var mpix = pixelsProcessed / (1024 * 1024);
          var timeSec = this.timeUsec / 1e6;
          this.mpixPerSec = (timeSec > 0) ? (mpix / timeSec) : 0;
        }
      }.bind(this));
  $scope.$on('$destroy', listenerRemover);
};

