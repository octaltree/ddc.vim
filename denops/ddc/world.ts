import { assertEquals, Denops, vars } from "./deps.ts";
import * as testDeno from "https://deno.land/x/denops_std@v1.0.0-beta.8/deps_test.ts#^";
import * as annonymous from "https://deno.land/x/denops_std@v1.0.0-beta.8/anonymous/mod.ts#^";

// Schema of the state of buffers, etc
export type World = {
  bufnr: number;
  filetype: string;
  event: string;
  mode: string;
  input: string;
  changedByCompletion: boolean;
  isLmap: boolean;
};

export function initialWorld(): World {
  return {
    bufnr: 0,
    filetype: "",
    event: "",
    mode: "",
    input: "",
    changedByCompletion: false,
    isLmap: false,
  };
}

// Fetches current state
export async function cacheWorld(
  denops: Denops,
  event: string,
): Promise<World> {
  const changedByCompletion: Promise<boolean> = (async () => {
    const completedItem =
      (await vars.v.get(denops, "completed_item")) as Record<string, unknown>;
    return event == "TextChangedP" && Object.keys(completedItem).length != 0;
  })();
  const isLmap: Promise<boolean> = (async () => {
    const iminsert =
      (await denops.call("getbufvar", "%", "&iminsert")) as number;
    return iminsert == 1;
  })();
  const mode: string = event == "InsertEnter"
    ? "i"
    : (await denops.call("mode")) as string;
  const input: Promise<string> = (async () => {
    return (await denops.call("ddc#get_input", mode)) as string;
  })();
  const bufnr: Promise<number> = (async () => {
    return (await denops.call("bufnr")) as number;
  })();
  const filetype: Promise<string> = (async () => {
    return (await denops.call("getbufvar", "%", "&filetype")) as string;
  })();
  return {
    bufnr: await bufnr,
    filetype: await filetype,
    event: event,
    mode: mode,
    input: await input,
    changedByCompletion: await changedByCompletion,
    isLmap: await isLmap,
  };
}

// is neglect-able
export function isNegligible(older: World, newer: World): boolean {
  return older.bufnr == newer.bufnr &&
    older.filetype == newer.filetype &&
    older.input == newer.input;
}

Deno.test("isNegligible", () => {
  assertEquals(true, isNegligible(initialWorld(), initialWorld()));
  assertEquals(
    isNegligible(
      { ...initialWorld(), input: "a" },
      { ...initialWorld(), input: "ab" },
    ),
    false,
  );
});

testDeno.test({
  mode: "all",
  name: "cacheWorld",
  fn: async (denops) => {
  },
});
