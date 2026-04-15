declare module "sql.js" {
  interface SqlJsStatic {
    Database: typeof Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface ParamsObject {
    [key: string]: any;
  }

  type BindParams = any[] | ParamsObject | null;

  class Statement {
    bind(params?: BindParams): boolean;
    step(): boolean;
    getAsObject(params?: ParamsObject): Record<string, any>;
    get(params?: BindParams): any[];
    free(): boolean;
    reset(): void;
  }

  class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
  export default initSqlJs;
  export { Database, Statement, SqlJsStatic };
}
