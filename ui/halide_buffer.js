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
goog.provide('safelight.Buffer');


goog.require('safelight.ArgumentKind');



/**
 * Buffer is a strongly-typed JS wrapper for the Halide buffer_t struct.
 *
 * It adds a couple of fields (type and dimensions) that are lacking in
 * the current buffer_t, but slated for addition (in some form); adding these
 * makes it unnecessary to package a Buffer with an Argument for visualization
 * purposes.
 *
 * @struct @constructor @final
 */
safelight.Buffer = function() {
  /** @export @type {!ArrayBuffer} */
  this.host = new ArrayBuffer(0);

  /** @export @type {!Array<number>} */
  this.extent = [0, 0, 0, 0];

  /** @export @type {!Array<number>} */
  this.stride = [0, 0, 0, 0];

  /** @export @type {!Array<number>} */
  this.min = [0, 0, 0, 0];

  /** @export @type {number} */
  this.elem_size = 0;

  /** @export @type {number} */
  this.dimensions = 0;

  /** @export @type {safelight.ArgumentTypeCode} */
  this.type_code = safelight.ArgumentTypeCode.UINT;
};

/**
 * A convenience function to convert from a loosely-typed Object
 * (provided by PackagedCall wrappers) into our strongly typed struct.
 *
 * @param {Object} dict dictionary from which to initialize
 * @return {!safelight.Buffer} the strongly-typed result.
 */
safelight.Buffer.fromDict = function(dict) {
  /** @type {!safelight.Buffer} */
  var buffer = new safelight.Buffer();
  buffer.host = dict['host'];
  buffer.extent = dict['extent'];
  buffer.stride = dict['stride'];
  buffer.min = dict['min'];
  buffer.elem_size = dict['elem_size'];
  buffer.dimensions = dict['dimensions'];
  buffer.type_code = dict['type_code'];
  return buffer;
};

/**
 * A convenience function to convert from a loosely-typed Object
 * (provided by PackagedCall wrappers) into our strongly typed struct,
 * where the 'host' field is a base64-encoded string instead of an ArrayBuffer.
 *
 * @param {Object} dict dictionary from which to initialize
 * @return {!safelight.Buffer} the strongly-typed result.
 */
safelight.Buffer.fromBase64Dict = function(dict) {
  /** @type {!safelight.Buffer} */
  var buffer = new safelight.Buffer();
  buffer.extent = dict['extent'];
  buffer.stride = dict['stride'];
  buffer.min = dict['min'];
  buffer.elem_size = dict['elem_size'];
  buffer.dimensions = dict['dimensions'];
  buffer.type_code = dict['type_code'];

  var binary = window.atob(dict['host']);
  var len = binary.length;
  buffer.host = new ArrayBuffer(len);
  var bytes = new Uint8Array(buffer.host);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return buffer;
};

/**
 * Return an Object that is equivalent to this HalideBuffer, but with
 * the host field set to a base64-encoded string rather than an ArrayBuffer.
 *
 * @return {!Object} result
 */
safelight.Buffer.prototype.toBase64 = function() {
  var binary = '';
  var bytes = new Uint8Array(this.host);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  var base64 = window.btoa(binary);
  return {
    'host': base64,
    'extent': this.extent,
    'stride': this.stride,
    'min': this.min,
    'elem_size': this.elem_size,
    'dimensions': this.dimensions,
    'type_code': this.type_code
  };
};
