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

#ifndef PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_PACKAGED_CALL_RUNTIME_H_
#define PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_PACKAGED_CALL_RUNTIME_H_

#include <stdio.h>
#include <string.h>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "HalideRuntime.h"

// This file provide various support types and functions for code generated
// by packaged_call.cc. It's deliberately in the "packaged_call_runtime"
// namespace (and *not* photos_editing_halide) to emphasize that it's
// meant to be reasonably isolated; packaged_call code should only
// need to rely on helper code in this namespace.
namespace packaged_call_runtime {

// Copy the contents of one buffer_t into another, copying as many channels
// from the source as will fit in the destination. Extra channels in the source
// are ignored; extra channels in the destination are filled to "opaque".
// (Note that elem_size==4 is assumed to be float, and the 'opaque' value
// is 1.0f; this is probably not what you want if the elem is actually [u]int32,
// but we can't currently infer the correct type from a buffer_t alone.)
//
// The source and destination must have matching elem_size;
// if they don't, no copy will be done, and false returned.
//
// The src and dest need not have identical memory layouts (in fact, this
// function is optimized to assume that layout conversion may need to be done).
//
// It's assumed that d->host points to a memory buffer sized appropriately
// to hold the result.
//
// (Note that the fields of d aren't modified by the call, but the memory
// pointed to by d->host is filled in, so d is considered
// an in-out parameter.)
bool Copy(const buffer_t* src, buffer_t* dst);

typedef int (*ArgvFunc)(void** args);

// An ArgumentPackager is the platform-specific bit of PackagedCall runtime
// that knows how to encode/decode arguments between a Package (which
// can vary by environment, transport mechanism, etc) and the underlying
// Halide call.
class ArgumentPackager {
 public:
  // Abstract type; this encapsulates a message sent to a PackagedCall,
  // or returned from a PackagedCall. The underlying type depends on what
  // the implementation of NewArgumentCodec() uses, but all forms will
  // generally be some variant on a key-value store (e.g. Pepper uses a PP_Var,
  // some tests use Json::Value, etc)
  struct Package {};

  struct ArgValue {
    union {
      halide_scalar_value_t scalar;
      buffer_t buffer;
    };

    ArgValue() { memset(this, 0, sizeof(*this)); }
  };

  virtual ~ArgumentPackager() {}

  // Fill in the Arguments for the inputs. If an Argument is a
  // buffer_t, you may assume that the host field will remain valid
  // for the lifetime of the ArgumentCodec (you do not need to manage
  // the lifetime of individual Arguments). You must not modify any fields
  // of the buffer, or the data pointed to by host (thought you may, of
  // course, make copies).
  virtual bool UnpackArgumentValue(void* user_context,
                                   const halide_filter_argument_t& a,
                                   ArgValue* arg_value) = 0;

  virtual bool PackResultValue(const halide_filter_argument_t& a,
                               const ArgValue& arg_value) = 0;

  virtual bool PackResultTimeUsec(double time_usec) = 0;
};

// Package* is a JSON-like type; it may be implemented on top
// of (e.g.) Pepper or jsoncpp
class ArgumentPackagerJson : public ArgumentPackager {
 public:
  bool UnpackArgumentValue(void* user_context,
                           const halide_filter_argument_t& a,
                           ArgValue* arg_value) override;

  bool PackResultValue(const halide_filter_argument_t& a,
                       const ArgValue& arg_value) override;

  bool PackResultTimeUsec(double time_usec) override;

 protected:
  class JsonValue {
   public:
    virtual ~JsonValue() {}
    virtual bool IsUndefined() const = 0;
    virtual bool IsMap() const = 0;
    virtual bool AsBool(bool* value) const = 0;
    virtual bool AsInt32(int32_t* value) const = 0;
    virtual bool AsDouble(double* value) const = 0;
    virtual bool AsByteArray(std::vector<uint8_t>* v) const = 0;
    virtual bool AsInt32Array(std::vector<int32_t>* v) const = 0;
    virtual std::unique_ptr<JsonValue> GetMember(
        const std::string& key) const = 0;
    virtual bool SetMember(const std::string& key,
                           const std::unique_ptr<JsonValue>& value) = 0;
  };

  virtual std::unique_ptr<JsonValue> NewMap() const = 0;
  virtual std::unique_ptr<JsonValue> NewInt32Array(const int32_t* data,
                                                   size_t len) const = 0;
  virtual std::unique_ptr<JsonValue> NewByteArray(const uint8_t* data,
                                                  size_t len) const = 0;
  virtual std::unique_ptr<JsonValue> NewInt32(int32_t i) const = 0;
  virtual std::unique_ptr<JsonValue> NewDouble(double d) const = 0;
  virtual std::unique_ptr<JsonValue> NewString(const std::string& s) const = 0;

  // Return a read-only pointer to the input message. Caller does *not* own
  // the pointer.
  virtual const JsonValue* GetInputMessage() const = 0;

  // Return a pointer to the output message. Caller does *not* own
  // the pointer.
  virtual JsonValue* GetOutputMessage() const = 0;

 private:
  // Must use a vector-of-ptrs-to-vectors: we must ensure that
  // the data pointer of each vector remains constant, and making
  // the by-value allows vector to copy them to different storage
  // areas. (Most noticeable on small-memory machines, e.g. Android)
  std::vector<std::unique_ptr<std::vector<uint8_t>>> host_storage_;

  bool GetMemberAsInt32Array(const std::unique_ptr<JsonValue>& value,
                             const std::string& name, const size_t len,
                             int32_t* result);
};

int MakePackagedCall(void* user_context,
                     const halide_filter_metadata_t* metadata,
                     ArgvFunc argv_func, ArgumentPackager* packager);

bool MetadataToJSON(const halide_filter_metadata_t* metadata,
                    std::string* json);

struct HalideFilterInfo {
  const halide_filter_metadata_t* const metadata;
  const ArgvFunc argv_func;
};
typedef std::map<std::string, HalideFilterInfo> HalideFilterInfoMap;

// BuildHalideFilterInfoMap is a simple utility that calls
// halide_enumerate_registered_filters() in its ctor to build a map of
// registered Halide filters. The map should be considered immutable after
// construction. Returns false if an error occurs.
bool BuildHalideFilterInfoMap(HalideFilterInfoMap* m);

}  // namespace packaged_call_runtime

#endif  // PHOTOS_EDITING_HALIDE_SAFELIGHT_VISUALIZERS_PACKAGED_CALL_RUNTIME_H_
