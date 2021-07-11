import { Denops, vars } from "./deps.ts";
import { Context, DdcOptions } from "./types.ts";
import { reduce } from "https://deno.land/x/itertools@v0.1.2/mod.ts";
import { assertEquals } from "https://deno.land/std@0.98.0/testing/asserts.ts";

// where
// T: Object
// partialMerge: PartialMerge
// merge: Merge
// partialMerge(partialMerge(a, b), c) == partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;

function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

export function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}
export const mergeSourceOptions = overwrite;
export const mergeSourceParams = overwrite;
export const mergeFilterOptions = overwrite;
export const mergeFilterParams = overwrite;

export function foldMerge<T>(
  merge: Merge<T>,
  def: Default<T>,
  partials: (null | undefined | Partial<T>)[],
): T {
  return reduce(
    partials.map((x) => x || {}),
    merge,
    def(),
  );
}

export function defaultDdcOptions(): DdcOptions {
  return {
    sources: [],
    defaultMatchers: [],
    defaultSorters: [],
    defaultConverters: [],
    sourceOptions: {},
    sourceParams: {},
    filterOptions: {},
    filterParams: {},
  };
}

function migrateEachKeys<T>(
  merge: PartialMerge<T>,
  a: null | undefined | Record<string, Partial<T>>,
  b: null | undefined | Record<string, Partial<T>>,
): null | Record<string, Partial<T>> {
  if (!a && !b) return null;
  const ret: Record<string, Partial<T>> = {};
  if (a) {
    for (const key in a) {
      ret[key] = a[key];
    }
  }
  if (b) {
    for (const key in b) {
      if (key in ret) {
        ret[key] = merge(ret[key], b[key]);
      } else {
        ret[key] = b[key];
      }
    }
  }
  return ret;
}

export function mergeDdcOptions(
  a: DdcOptions,
  b: Partial<DdcOptions>,
): DdcOptions {
  const overwritten: DdcOptions = overwrite(a, b);
  const partialMergeSourceOptions = partialOverwrite;
  const partialMergeSourceParams = partialOverwrite;
  const partialMergeFilterOptions = partialOverwrite;
  const partialMergeFilterParams = partialOverwrite;
  return {
    sources: overwritten.sources,
    defaultMatchers: overwritten.defaultMatchers,
    defaultSorters: overwritten.defaultSorters,
    defaultConverters: overwritten.defaultConverters,
    sourceOptions: migrateEachKeys(
      partialMergeSourceOptions,
      a.sourceOptions,
      b.sourceOptions,
    ) || {},
    filterOptions: migrateEachKeys(
      partialMergeFilterOptions,
      a.filterOptions,
      b.filterOptions,
    ) || {},
    sourceParams: migrateEachKeys(
      partialMergeSourceParams,
      a.sourceParams,
      b.sourceParams,
    ) || {},
    filterParams: migrateEachKeys(
      partialMergeFilterParams,
      a.filterParams,
      b.filterParams,
    ) || {},
  };
}

function patchDdcOptions(
  a: Partial<DdcOptions>,
  b: Partial<DdcOptions>,
): Partial<DdcOptions> {
  const overwritten: Partial<DdcOptions> = { ...a, ...b };
  const so = migrateEachKeys(
    partialOverwrite,
    a.sourceOptions,
    b.sourceOptions,
  );
  if (so) overwritten.sourceOptions = so;
  const fo = migrateEachKeys(
    partialOverwrite,
    a.filterOptions,
    b.filterOptions,
  );
  if (fo) overwritten.filterOptions = fo;
  const sp = migrateEachKeys(partialOverwrite, a.sourceParams, b.sourceParams);
  if (sp) overwritten.sourceParams = sp;
  const fp = migrateEachKeys(partialOverwrite, a.filterParams, b.filterParams);
  if (fp) overwritten.filterParams = fp;
  return overwritten;
}

// Customization by end users
class Custom {
  global: Partial<DdcOptions> = {};
  filetype: Record<string, Partial<DdcOptions>> = {};
  buffer: Record<number, Partial<DdcOptions>> = {};

  get(ft: string, bufnr: number): DdcOptions {
    const filetype = this.filetype[ft] || {};
    const buffer = this.buffer[bufnr] || {};
    return foldMerge(mergeDdcOptions, defaultDdcOptions, [
      this.global,
      filetype,
      buffer,
    ]);
  }

  setGlobal(options: Partial<DdcOptions>) {
    this.global = options;
  }
  setFiletype(ft: string, options: Partial<DdcOptions>) {
    this.filetype[ft] = options;
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.buffer[bufnr] = options;
  }
  patchGlobal(options: Partial<DdcOptions>) {
    this.global = patchDdcOptions(this.global, options);
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>) {
    this.filetype[ft] = patchDdcOptions(this.filetype[ft] || {}, options);
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.buffer[bufnr] = patchDdcOptions(this.buffer[bufnr] || {}, options);
  }
}

// Caches the state of buffers, etc. immediately after an event occurs.
interface World {
  bufnr: number;
  filetype: string;
  event: string;
  mode: string;
  input: string;
  changedByCompletion: boolean;
  isLmap: boolean;
}

// Fetchs current state
async function cacheWorld(denops: Denops, event: string): Promise<World> {
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

export class ContextBuilder {
  lastWorld: World;
  custom: Custom = new Custom();

  constructor() {
    this.lastWorld = {
      bufnr: 0,
      filetype: "",
      event: "",
      mode: "",
      input: "",
      changedByCompletion: false,
      isLmap: false,
    };
  }

  async cacheWorld(denops: Denops, event: string): Promise<World> {
    return await cacheWorld(denops, event);
  }

  async createContext(
    denops: Denops,
    event: string,
  ): Promise<null | [Context, DdcOptions]> {
    const world = await this.cacheWorld(denops, event);
    if (this.lastWorld == world) return null;
    this.lastWorld = world;
    if (world.isLmap || world.changedByCompletion) {
      return null;
    }
    const userOptions = this.custom.get(world.filetype, world.bufnr);
    const context = {
      input: world.input,
    };
    return [context, userOptions];
  }

  getGlobal(): Partial<DdcOptions> {
    return this.custom.global;
  }
  getFiletype(): Record<string, Partial<DdcOptions>> {
    return this.custom.filetype;
  }
  getBuffer(): Record<number, Partial<DdcOptions>> {
    return this.custom.buffer;
  }

  patchGlobal(options: Partial<DdcOptions>) {
    this.custom.patchGlobal(options);
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>) {
    this.custom.patchFiletype(ft, options);
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.custom.patchBuffer(bufnr, options);
  }
}

Deno.test("patchDdcOptions", () => {
  const custom = new Custom();
  custom.setGlobal({
    sources: ["around"],
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
  });
  custom.patchGlobal({
    sources: ["around", "baz"],
    sourceParams: {
      "baz": {
        foo: "bar",
      },
    },
  });
  assertEquals(custom.global, {
    sources: ["around", "baz"],
    sourceParams: {
      "around": {
        maxSize: 300,
      },
      "baz": {
        foo: "bar",
      },
    },
  });
  custom.patchFiletype("markdown", {
    filterParams: {
      "hoge": {
        foo: "bar",
      },
    },
  });
  assertEquals(custom.filetype, {
    markdown: {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    },
  });
});

Deno.test("mergeDdcOptions", () => {
  const custom = new Custom();
  custom.setGlobal({
    sources: ["around"],
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
  });
  custom.setFiletype("typescript", {
    sources: [],
    filterParams: {
      "matcher_head": {
        foo: 2,
      },
    },
  });
  custom.setBuffer(1, {
    sources: ["around", "foo"],
    filterParams: {
      "matcher_head": {
        foo: 3,
      },
      "foo": {
        max: 200,
      },
    },
  });
  custom.patchBuffer(2, {});
  assertEquals(custom.get("typescript", 1), {
    defaultMatchers: [],
    defaultSorters: [],
    defaultConverters: [],

    sources: ["around", "foo"],
    sourceOptions: {},
    filterOptions: {},
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
    filterParams: {
      "matcher_head": {
        foo: 3,
      },
      "foo": {
        max: 200,
      },
    },
  });
  assertEquals(custom.get("typescript", 2), {
    defaultMatchers: [],
    defaultSorters: [],
    defaultConverters: [],

    sources: [],
    sourceOptions: {},
    filterOptions: {},
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
    filterParams: {
      "matcher_head": {
        foo: 2,
      },
    },
  });
});
