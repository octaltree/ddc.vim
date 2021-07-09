" set verbose=1

let s:assert = themis#helper('assert')
let s:suite = themis#suite('ddc')

function! s:suite.get_input() abort
endfunction

function! s:suite.cache_world() abort
  echo denops#request('ddc', '_cacheWorld', [])
endfunction
