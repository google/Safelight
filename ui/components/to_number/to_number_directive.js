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
goog.provide('safelight.toNumber.module');
goog.provide('safelight.toNumberDirective');



/**
 * Simple directive used as an element that forces the parsed value
 * of the control to be parsed as a number (specifically, as a float);
 * this exists solely as a workaround for the HTML range input, which
 * always provides the value as a string rather than a number.
 *
 * Usage:
 * <input type='range' to-number ... ></input>
 *
 * @return {!angular.Directive}
 */
safelight.toNumberDirective = function() {
  return {
    require: 'ngModel',
    link: function(scope, elem, attrs, ctrl) {
      ctrl.$parsers.push(function(value) {
        return parseFloat(value || '');
      });
    }
  };
};


/** @const {!angular.Module} */
safelight.toNumber.module =
    angular.module('safelight.toNumber.module', [])
    .directive('toNumber', safelight.toNumberDirective);