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
goog.provide('safelight.imagePreview.module');
goog.provide('safelight.imagePreviewDirective');

goog.require('safelight.Visualizer');
goog.require('safelight.visualizer.module');



/**
 * Widget for visualizing arbitrary Buffers in Safelight; the value
 * is assumed to be an object containing a Buffer and Argument, and the RGBA8
 * Visualizer is always used to render it.
 *
 * @ngInject
 * @param {!safelight.Visualizer} visualizer
 * @return {!angular.Directive}
 */
safelight.imagePreviewDirective = function(visualizer) {
  return {
    restrict: 'E',
    template: '<img/>',
    link: function(scope, element, attrs) {
      var image = element.children()[0];
      image.className = attrs['class'] || 'img-thumbnail';
      scope.$watch(attrs.value, function(newValue, oldValue) {
        if (newValue) {
          visualizer.visualizeAsPng('rgba8', newValue)
          .then(
              function(pngData) {
                image.src = pngData;
              },
              function(alwaysNull) {
                // deliberately broken image
                image.src = null;
              }
          );
        } else {
          // deliberately broken image
          image.src = null;
        }
      });
    }
  };
};


/** @const {!angular.Module} */
safelight.imagePreview.module =
    angular.module('safelight.imagePreview.module', [
      safelight.visualizer.module.name
    ])
    .directive('imagePreview', safelight.imagePreviewDirective);

