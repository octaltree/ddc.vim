TS=$(shell find denops -name "*.ts")
TSTEST=$(shell grep -rl "Deno.test" denops)

lint:
	vint --version
	vint plugin
	vint autoload
	deno fmt --check denops
	deno test --unstable --no-run -A ${TS}
	deno lint --unstable denops

test:
	DENOPS_TEST_VIM=${DENOPS_TEST_VIM} DENOPS_TEST_NVIM=${DENOPS_TEST_NVIM}\
									DENOPS_PATH=${DENOPS_PATH} deno test --unstable -A ${TSTEST}

format:
	deno fmt denops

DENOPS_TEST_NVIM=nvim
DENOPS_TEST_VIM=vim
DENOPS_PATH=~/.cache/dein/repos/github.com/vim-denops/denops.vim

denops-test:
	DENOPS_TEST_VIM=${DENOPS_TEST_VIM}\
									DENOPS_TEST_NVIM=${DENOPS_TEST_NVIM}\
									DENOPS_PATH=${DENOPS_PATH}\
									deno test --unstable -A $$(grep -rl testDeno.test denops)

.PHONY: lint test format
