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

package main

/* filterFactory creates Halide filters and their corresponding .s, .stmt. and .html files.
 * Example invocation: ./safelight/server/bin/filterFactory [name] [generator_src] ["link_to_gen=utils.o" ...] [generator_args]
 *
 * Note: If the generator name already exists in ${SAFELIGHT_TMP}/filters, unless the function name contains the string "safelight",
 * it will not be rebuilt.  Since Safelight uses generators that build multiple filters, this provides a drastric
 * performance increase when building the Safelight server.
 */

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"safelight"
	"strings"
	"time"
)

// Globals for NewRunCmd and timeout
var (
	NewRunCmd = safelight.NewRunCmd
	timeout   = flag.Duration("timeout", 5*60*time.Second, "timeout for building generator")
)

// runLogAndCheckCommand runs the command defined in the *exec.Cmd object.
// The command, errors, and any output to Stdout is printed to the console.
func runLogAndCheckCommand(cmd *exec.Cmd) {
	var c = make(chan string)
	runCmd := NewRunCmd("tmp", c, *timeout)
	results, genErr := runCmd.RunCmdAndReturnStdout(cmd)
	if genErr != nil {
	        rawCommand := ""
		for i := 0; i < len(cmd.Args); i++ {
			rawCommand += " " + cmd.Args[i]
		}
		fmt.Printf("\nError with command: \"%s\"\n%s\nRun the command above to debug.\n", rawCommand, genErr)
		os.Exit(1)
	} else {
		fmt.Printf("%s", results)
	}
}

// Creates a halide filter and its .s, .stmt, and .html files:
// Example invocation: ./filterFactory [name] [generator_src] ["link_to_gen=utils.o" ...] [generator_args]
func main() {

	if strings.Contains(os.Args[1], "-h") {
		fmt.Printf("Invocation: ./filterFactory [name] [generator_src] [\"link_to_gen=utils.o\" ...] [generator_args]\n")
		return
	}

	filtersDir := os.Getenv("SAFELIGHT_TMP") + "/filters/"
	halide := os.Getenv("HALIDE_DIR")
	safelight := os.Getenv("SAFELIGHT_DIR")
	gencppLocation := os.Args[2]

	// If not an absolute path, assume relative to within safelight directory.
	if gencppLocation[0] != '/' {
		gencppLocation = safelight + "/" + gencppLocation
	}
	functionName := os.Args[1]
	genArgs := os.Args[3:]

	// Obtain the object files that need to be linked to the .generator executable
	linkToGen := []string{}
	for i, value := range genArgs {
		if strings.Contains(value, "link_to_gen=") {
			objectFile := strings.Split(value, "link_to_gen=")[1]
			linkToGen = append(linkToGen, objectFile)
			genArgs = append(genArgs[:i], genArgs[(i+1):]...)
		}
	}

	// Extract generator name
	pathSeparations := strings.Split(gencppLocation, "/")
	generatorName := strings.Split(pathSeparations[len(pathSeparations)-1], "_generator.c")[0]

	// Create directory for filters to be placed
	mkDirCmd := exec.Command("mkdir", "-p", filtersDir)
	runLogAndCheckCommand(mkDirCmd)

	//If the generator already exists, do not rebuild it, unless it is a safelight generator.
        if _, err := os.Stat(filtersDir + generatorName + ".generator"); os.IsNotExist(err) || strings.Contains(functionName, "safelight") {
		fmt.Printf("Building generator %s...\n", generatorName)
		// Build the .generator executable
		dotGenArgs := []string{"-std=c++11", "-g", "-Wall", "-Werror", "-Wno-unused-function", "-Wcast-qual",
			"-fno-rtti", "-I" + safelight, "-I" + halide + "/include", gencppLocation,
			halide + "/tools/GenGen.cpp", "-L" + halide + "/bin", "-lHalide", "-lz", "-lpthread", "-ldl", "-o",
			filtersDir + generatorName + ".generator"}
		dotGenArgs = append(dotGenArgs, linkToGen...)
		genGenCmd := exec.Command("g++", dotGenArgs...)
		runLogAndCheckCommand(genGenCmd)
	}

	fmt.Printf("Building %s...\n", os.Args[1])

	// Set environment variables for dynamic linking
	os.Setenv("DYLD_LIBRARY_PATH", halide+"/bin")
	os.Setenv("LD_LIBRARY_PATH", halide+"/bin")

	// Build filter ([generatorName].h and [generatorName].o)
	generatorExecName := filtersDir + generatorName + ".generator"
	args := []string{"-g", generatorName, "-f", functionName, "-o", filtersDir}
	args = append(args, genArgs...)
	genExecAndHdrCmd := exec.Command(generatorExecName, args...)
	runLogAndCheckCommand(genExecAndHdrCmd)
}
