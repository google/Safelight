SHELL := /bin/bash

NACL_CC_x86_64=${NACL_TOOLCHAIN_BIN}/x86_64-nacl-clang++
NACL_CC_x86_32=${NACL_TOOLCHAIN_BIN}/x86_64-nacl-clang++
NACL_CC_arm_32=${NACL_TOOLCHAIN_BIN}/arm-nacl-clang++
CFLAGS=${COMPILE_FLAGS} -std=gnu++11
INCLUDES=-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR}
LDFLAGS=L${NEXE_RELEASE_DIR}_$1/Release ${NEXE_LINKING_FLAGS}
EXECUTABLE=${SAFELIGHT_PREBUILTDIR}/nacl_sniffer.nexe

all: ${SAFELIGHT_PREBUILTDIR}/x86_64/nacl_sniffer.nexe ${SAFELIGHT_PREBUILTDIR}/x86_32/nacl_sniffer.nexe \
${SAFELIGHT_PREBUILTDIR}/arm/nacl_sniffer.nexe 
#${SAFELIGHT_PREBUILTDIR}/x86_64/visualizers_shell.nexe \
# ${SAFELIGHT_PREBUILTDIR}/x86_32/visualizers_shell.nexe  ${SAFELIGHT_PREBUILTDIR}/arm/visualizers_shell.nexe 

.PHONY: clean
clean:
	${SAFELIGHT_DIR}/clean.sh

# nacl_sniffer.nexes for x86_64, x86_32, and arm. 
${SAFELIGHT_PREBUILTDIR}/x86_64/nacl_sniffer.nexe: ${SAFELIGHT_TMP}/x86_64/nexe_verb_handler.o
	mkdir -p ${SAFELIGHT_PREBUILTDIR}/x86_64
	$(NACL_CC_x86_64) $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/ui/components/nacl_sniffer/nacl_sniffer.cc $(LDFLAGS) -o $@

${SAFELIGHT_PREBUILTDIR}/x86_32/nacl_sniffer.nexe: ${SAFELIGHT_TMP}/x86_32/nexe_verb_handler.o
	mkdir -p ${SAFELIGHT_PREBUILTDIR}/x86_32
	$(NACL_CC_x86_32) -m32 $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/ui/components/nacl_sniffer/nacl_sniffer.cc $(LDFLAGS) -o $@

${SAFELIGHT_PREBUILTDIR}/arm/nacl_sniffer.nexe: ${SAFELIGHT_TMP}/arm/nexe_verb_handler.o
	mkdir -p ${SAFELIGHT_PREBUILTDIR}/arm
	$(NACL_CC_arm_32) $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/ui/components/nacl_sniffer/nacl_sniffer.cc $(LDFLAGS) -o $@


# nexe_verb_handler.o for x86_64, x86_32, and arm.
CFLAGS=${COMPILE_FLAGS} -c
INCLUDES=-I${NACL_PEPPER_INCLUDE} -I${SAFELIGHT_DIR} -I${HALIDE_DIR}/include
LDFLAGS=

${SAFELIGHT_TMP}/x86_64/nexe_verb_handler.o:
	mkdir -p ${SAFELIGHT_TMP}/x86_64
	$(NACL_CC_x86_64) $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc $(LDFLAGS)
	mv nexe_verb_handler.o ${SAFELIGHT_TMP}/x86_64

${SAFELIGHT_TMP}/x86_32/nexe_verb_handler.o:
	mkdir -p ${SAFELIGHT_TMP}/x86_32
	$(NACL_CC_x86_32) -m32 $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc $(LDFLAGS)
	mv nexe_verb_handler.o ${SAFELIGHT_TMP}/x86_32

${SAFELIGHT_TMP}/arm/nexe_verb_handler.o:
	mkdir -p ${SAFELIGHT_TMP}/arm_32
	$(NACL_CC_arm_32) $(CFLAGS) $(INCLUDES) ${SAFELIGHT_DIR}/visualizers/nexe_verb_handler.cc $(LDFLAGS)
	mv nexe_verb_handler.o ${SAFELIGHT_TMP}/arm_32


NACL_ARCHIVE_x86_64=$(NACL_TOOLCHAIN_BIN)x86-64-nacl-ar
NACL_ARCHIVE_x86_32=$(NACL_TOOLCHAIN_BIN)pnacl-ar
NACL_ARCHIVE_arm_32=$(NACL_TOOLCHAIN_BIN)arm-32-nacl-ar
NACL_MODULE_INCLUDES=-I$(SAFELIGHT_DIR) -I$(NACL_PEPPER_INCLUDE) -I$(HALIDE_DIR}/include


