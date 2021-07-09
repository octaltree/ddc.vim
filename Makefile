PATH := ./tools/vim-themis/bin:$(PATH)
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
	deno test --unstable -A ${TSTEST}
	THEMIS_VIM=nvim THEMIS_ARGS="-e --headless" themis tests/*.vim
	THEMIS_VIM=vim THEMIS_ARGS="-e -s" themis tests/*.vim

format:
	deno fmt denops

tools/vim-themis:
	mkdir -p tools
	git clone https://github.com/thinca/vim-themis $@

.PHONY: lint test format
