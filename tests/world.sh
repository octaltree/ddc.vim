#!/bin/bash

out=`mktemp`
f=`cat<<EOF
function! Main() abort
  let text = "Lorem ipsum sit dolor amet ..."
  exe "normal! a" . text . "\<Esc>"
  call setpos('.', [1, 1, 8, 0])
  let world = denops#request('ddc', '_cacheWorld', ['InsertEnter'])
  call append(line('$'), json_encode(world))
  w! $out
  q
endfunction
EOF`

nvim -e --headless -c "$f" -c "autocmd User DDCReady call Main()"

cat $out
rm $out
