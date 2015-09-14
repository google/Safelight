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
goog.provide('safelight.TextPanelController');



/**
 * Controller for safelight.TextPanelDirective.
 *
 * @struct @ngInject @export @constructor
 * @param {!angular.Scope} $scope
 */
safelight.TextPanelController = function($scope) {
  /** @export @type {string} */
  this.name = '';

  /** @export @type {string} */
  this.contents = '';

  /** @export @type {boolean} */
  this.refresh = false;

  $scope.$on('refresh', function() {
    this.refresh = !this.refresh;
  }.bind(this));
};

