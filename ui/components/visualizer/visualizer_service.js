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
goog.provide('safelight.Visualizer');
goog.provide('safelight.visualizer.module');

goog.require('safelight.Buffer');
goog.require('safelight.NexeModule');
goog.require('safelight.NexeModuleLoader');
goog.require('safelight.nexeModuleLoader.module');



/**
 * Visualizer is a service that does various common operations on images
 * for Safelight, generally converting between Buffer
 * and other related formats, or providing visualization assistance
 * (e.g., given an arbitrary Buffer, attempt to provide a reasonable RGBA
 * preview).
 *
 * @struct @ngInject @constructor
 * @param {!angular.$q} $q
 * @param {!safelight.NexeModuleLoader} nexeModuleLoader
 */
safelight.Visualizer = function($q, nexeModuleLoader) {
  /** @private @type {!angular.$q} */
  this.$q_ = $q;

  /** @private @type {safelight.NexeModule} */
  this.nexeModule_ = nexeModuleLoader.load('/visualizers.nmf');
};


/**
 * Given a Buffer, return a conversion into an 8-bit PNG.
 * This function attempts to make reasonable decisions about how to render
 * the result, based on the Buffer data.
 *
 * Return is done via a Promise, which provides a data URL for PNG data
 * (upon success), or an empty call to reject() (upon failure).
 *
 * @param {string} visualizer visualization method to use (e.g. 'rgba8').
 * @param {!safelight.Buffer} buffer input buffer to visualize.
 * @return {!angular.$q.Promise} Angular promise object.
 */
safelight.Visualizer.prototype.visualizeAsPng = function(visualizer,
                                                         buffer) {
  /** @type {!angular.$q.Deferred} */
  var deferred = this.$q_.defer();
  this.nexeModule_
      .request(
          'visualize',
          {
            'visualizer': visualizer,
            'buffer': buffer
          }
      )
      .then(
          function(success) {
            /** @type {string} */
            var pngData = this.bufferToPngData_(success['success']['buffer']);
            deferred.resolve(pngData);
          }.bind(this),
          function(failure) {
            deferred.reject(failure['failure']);
          }.bind(this)
      );
  return deferred.promise;
};


/**
 * Given an Buffer containing RGBA8 data, produce another Buffer with arbitrary
 * type and dimensions, using a best-guess approach for things that aren't
 * RGBA8-like. The input buffer is unaffected.
 *
 * @param {!safelight.Buffer} buffer input buffer to visualize.
 * @param {string} type_code The desired type code.
 * @param {number} type_bits The desired type size, in bits.
 * @param {number} dimensions The number of dimensions desired.
 * @return {!angular.$q.Promise} Angular promise object.
 */
safelight.Visualizer.prototype.transmogrifyRGBA8Buffer = function(buffer,
                                                                  type_code,
                                                                  type_bits,
                                                                  dimensions) {
  /** @type {!angular.$q.Deferred} */
  var deferred = this.$q_.defer();
  this.nexeModule_
      .request(
          'transmogrify',
          {
            'buffer': buffer,
            'type_code': type_code,
            'type_bits': type_bits,
            'dimensions': dimensions
          }
      )
      .then(
          function(success) {
            deferred.resolve(success['success']['buffer']);
          }.bind(this),
          function(failure) {
            deferred.reject(failure['failure']);
          }.bind(this)
      );
  return deferred.promise;
};


/**
 * Given an Image, convert into an RGBA8 Buffer. The image is unaffected.
 *
 * @param {!Image} image The image to convert.
 * @return {!safelight.Buffer} The safelight Buffer.
 */
safelight.Visualizer.prototype.imageToBuffer = function(image) {
  var canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  var context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  var data = context.getImageData(0, 0, canvas.width, canvas.height);
  return safelight.Buffer.fromDict({
    'host': data.data.buffer,
    'extent': [canvas.width, canvas.height, 4, 0],
    'stride': [4, canvas.width * 4, 1, 0],
    'min': [0, 0, 0, 0],
    'elem_size': 1,
    'type_code': 'uint',
    'dimensions': 3
  });
};


/**
 * Given a Buffer, convert into a PNG Data URL and return it. It is assumed
 * that the Buffer is already in RGBA8 form; if it isn't, the results
 * will be unpredictable.
 *
 * @private
 * @param {!safelight.Buffer} buffer input buffer to visualize.
 * @return {string} Data URL for PNG data.
 */
safelight.Visualizer.prototype.bufferToPngData_ = function(buffer) {
  // Note that angular.$document doesn't expose the createElement() method,
  // so we (apparently) must use the document object directly.
  var canvas = document.createElement('canvas');
  canvas.width = buffer.extent[0];
  canvas.height = buffer.extent[1];
  if (canvas.width > 0 && canvas.height > 0) {
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(canvas.width, canvas.height);
    imageData.data.set(new Uint8ClampedArray(buffer.host));
    context.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL('image/png');
};


/** @const {!angular.Module} */
safelight.visualizer.module =
    angular.module('safelight.visualizer.module', [
      safelight.nexeModuleLoader.module.name
    ])
    .service('visualizer', safelight.Visualizer);
