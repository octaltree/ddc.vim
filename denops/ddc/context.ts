import {
  assertEquals,
  Denops,
  isArray,
  isObject,
  isString,
  vars,
} from "./deps.ts";
import { Context, DdcOptions, FilterOptions, SourceOptions } from "./types.ts";
import { reduce } from "https://deno.land/x/itertools@v0.1.2/mod.ts";

// where
// T: Object
// partialMerge: PartialMerge
// partialMerge(partialMerge(a, b), c) == partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;
//type Parse<T> = (x: unknown) => null | T;

export function parseDdcOptions(x: unknown): null | Partial<DdcOptions> {
  if (!isObject(x)) return null;
  const ret: Partial<DdcOptions> = {};
  if (isArray(x["sources"], isString)) x.sources = x["sources"];
  if (isObject(x["source_options"])) {
    x.sourceOptions = Object.fromEntries(
      Object.entries(x["source_options"]).map((
        [k, v],
      ) => ([k, parseSourceOptions(v)]))
        .filter(([_, v]) => v),
    );
  }
  if (isObject(x["filter_options"])) {
    x.filterOptions = Object.fromEntries(
      Object.entries(x["filter_options"]).map((
        [k, v],
      ) => ([k, parseFilterOptions(v)]))
        .filter(([_, v]) => v),
    );
  }
  if (isObject(x["source_params"], isObject)) {
    x.sourceParams = x["source_params"];
  }
  if (isObject(x["filter_params"], isObject)) {
    x.filterParams = x["filter_params"];
  }
  return ret;
}

function parseSourceOptions(x: unknown): null | Partial<SourceOptions> {
  if (!isObject(x)) return null;
  const ret: Partial<SourceOptions> = {};
  if (isString(x["mark"])) ret.mark = x["mark"];
  if (isArray(x["matchers"], isString)) ret.matchers = x["matchers"];
  if (isArray(x["sorters"], isString)) ret.sorters = x["sorters"];
  if (isArray(x["converters"], isString)) ret.converters = x["converters"];
  return ret;
}

function parseFilterOptions(x: unknown): null | Partial<FilterOptions> {
  return x as Partial<FilterOptions>;
}

function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}
export const mergeSourceOptions: Merge<SourceOptions> = overwrite;
export const mergeFilterOptions: Merge<FilterOptions> = overwrite;
export const mergeSourceParams: Merge<Record<string, unknown>> = overwrite;
export const mergeFilterParams: Merge<Record<string, unknown>> = overwrite;

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

  setGlobal(options: Partial<DdcOptions>): Custom {
    this.global = options;
    return this;
  }
  setFiletype(ft: string, options: Partial<DdcOptions>): Custom {
    this.filetype[ft] = options;
    return this;
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>): Custom {
    this.buffer[bufnr] = options;
    return this;
  }
  patchGlobal(options: Partial<DdcOptions>): Custom {
    this.global = patchDdcOptions(this.global, options);
    return this;
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>): Custom {
    this.filetype[ft] = patchDdcOptions(this.filetype[ft] || {}, options);
    return this;
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>): Custom {
    this.buffer[bufnr] = patchDdcOptions(this.buffer[bufnr] || {}, options);
    return this;
  }
}

// Schema of the state of buffers, etc
type World = {
  bufnr: number;
  filetype: string;
  event: string;
  mode: string;
  input: string;
  changedByCompletion: boolean;
  isLmap: boolean;
};

function initialWorld(): World {
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
  private lastWorld: World = initialWorld();
  private custom: Custom = new Custom();

  // Re-export for denops.dispatcher
  async _cacheWorld(denops: Denops, event: string): Promise<World> {
    return await cacheWorld(denops, event);
  }

  async createContext(
    denops: Denops,
    event: string,
  ): Promise<null | [Context, DdcOptions]> {
    const world = await this._cacheWorld(denops, event);
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
  const custom = (new Custom())
    .setGlobal({
      sources: ["around"],
      sourceParams: {
        "around": {
          maxSize: 300,
        },
      },
    })
    .patchGlobal({
      sources: ["around", "baz"],
      sourceParams: {
        "baz": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("markdown", {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("cpp", {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("cpp", {
      filterParams: {
        "hoge": {
          foo: "baz",
          alice: "bob",
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
  assertEquals(custom.filetype, {
    markdown: {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    },
    cpp: {
      filterParams: {
        "hoge": {
          foo: "baz",
          alice: "bob",
        },
      },
    },
  });
});

Deno.test("mergeDdcOptions", () => {
  const custom = (new Custom())
    .setGlobal({
      sources: ["around"],
      sourceParams: {
        "around": {
          maxSize: 300,
        },
      },
    })
    .setFiletype("typescript", {
      sources: [],
      filterParams: {
        "matcher_head": {
          foo: 2,
        },
      },
    })
    .setBuffer(1, {
      sources: ["around", "foo"],
      filterParams: {
        "matcher_head": {
          foo: 3,
        },
        "foo": {
          max: 200,
        },
      },
    })
    .patchBuffer(2, {});
  assertEquals(custom.get("typescript", 1), {
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
  assertEquals(custom.get("cpp", 1), {
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
});
