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
goog.provide('safelight.showTailDirective');



/**
 * Simple directive that forces a textarea to always scroll to the bottom;
 * useful for annotating fields that are meant to update things like build
 * logs.
 *
 * Usage:
 * <textarea show-tail>...</textarea>
 *
 * @return {!angular.Directive}
 */
safelight.showTailDirective = function() {
  var link = function(scope, elem, attr) {
    scope.$watch(
      function() {
        return elem[0].value;
      },
      function(e) {
        elem[0].scrollTop = elem[0].scrollHeight;
      }
    );
  };
  return {
    restrict: 'A',
    link: link
  };
};
