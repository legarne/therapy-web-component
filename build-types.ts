import ts from "npm:typescript@5.6.2";
import chalk from "npm:chalk@5.4.1";
import { existsSync, walkSync } from "jsr:@std/fs@1.0.8";
import { join, normalize, parse } from "jsr:@std/path@1.0.8";
import { Buffer } from "node:buffer";

/**
 * Auto type-builder for WebComponents.
 * @module
 */

type Nullish<T> = T | null | undefined;

/**
 * Automatically builds a type file for any WebComponents found in the project. Writes to `components.d.ts` file in the `cwd`.
 * Valid components are those that extend `WebComponent`, and it will include a generic type, if it exists.
 *
 * Components **must** have a static member of `componentName` from which to derive its tag name, e.g. `static componentName = "x-comp";`
 * @see
 * Recommended to run under a watch flag, e.g. `deno run -A --watch=./src @therapy/web-component/build-types`
 */
export const buildDocs = (): void => {
  const WEB_COMPONENT_NAME = "WebComponent";
  const COMPONENT_MEMBER_NAME = "componentName";
  const COMPONENT_DTS = "components.d.ts";

  const args = Deno.args;

  const getCompRoot = (): string => {
    if (args.length <= 0) return "src";
    else {
      const argPath = normalize(args[0]);
      const parsePath = parse(argPath);
      return join(parsePath.dir, parsePath.name);
    }
  };

  const addToDenoJson = () => {
    if (!existsSync(join(cwd, "deno.json"))) {
      throw new Error("No deno.json");
    }

    const denoJson: {
      compilerOptions?: { jsx?: string; jsxFactory?: string; types?: string[] };
    } = JSON.parse(new TextDecoder().decode(
      Deno.readFileSync(join(cwd, "deno.json")),
    ));

    if (!("compilerOptions" in denoJson)) denoJson.compilerOptions = {};
    if (!("types" in denoJson.compilerOptions!)) {
      denoJson.compilerOptions!.types = [];
    }

    const hasDTs = denoJson.compilerOptions!.types?.some((t) =>
      t.includes(COMPONENT_DTS)
    );
    if (!hasDTs) {
      denoJson.compilerOptions!.types!.push(`./${COMPONENT_DTS}`);
    }

    Deno.writeFileSync(
      join(cwd, "deno.json"),
      Buffer.from(JSON.stringify(denoJson, null, 2)),
    );
  };

  const cwd = Deno.cwd();

  const componentRoot = getCompRoot();
  if (!existsSync(join(cwd, componentRoot))) {
    console.log(
      chalk.red(`Path: ${cwd}/${componentRoot} doesn't exist, exiting`),
    );
    Deno.exit(1);
  }

  console.log(chalk.green(`Building from: ${componentRoot}`));
  console.log(chalk.yellowBright("Building WebComponents docs"));
  console.log(chalk.yellowBright("Finding files..."));

  const files = Array.from(
    walkSync(join(cwd, componentRoot), { exts: ["ts", "tsx"] }),
  );

  interface GenFiles {
    className: string;
    interfaceType: Nullish<string>;
    componentName: string;
    filePath: string;
    isDefault?: boolean;
  }

  const canGenFiles: GenFiles[] = [];

  const getSuperParent = (node: ts.ClassDeclaration): Nullish<string> => {
    // exit if no super class
    if (!node.heritageClauses || node.heritageClauses.length <= 0) return;
    const [heritage] = node.heritageClauses;

    if (heritage.types.length <= 0) return;
    const [expr] = heritage.types;

    const superParent = (expr.expression as any).escapedText;

    // only parse WebComponent files
    if (!superParent || !superParent.includes(WEB_COMPONENT_NAME)) return;

    return superParent;
  };

  const getInterfaceType = (node: ts.ClassDeclaration): Nullish<string> => {
    // exit if no super class
    if (!node.heritageClauses || node.heritageClauses.length <= 0) return;
    const [heritage] = node.heritageClauses;

    if (heritage.types.length <= 0) return;
    const [expr] = heritage.types;

    if (!expr.typeArguments || expr.typeArguments.length < 0) return;

    const [typeArgs] = expr.typeArguments;

    const typeName = (typeArgs as any).typeName
      ? (typeArgs as any).typeName.escapedText
      : undefined;

    return typeName;
  };

  const getComponentName = (
    members: ts.ClassLikeDeclarationBase["members"],
  ): Nullish<string> => {
    let componentName: Nullish<string>;

    members.forEach((member: any) => {
      if (!member.modifiers || member.modifiers.length <= 0) return;
      const [mod] = member.modifiers;

      if (mod.kind !== ts.SyntaxKind.StaticKeyword) return;

      const memberName = member.name.escapedText;
      if (memberName !== COMPONENT_MEMBER_NAME) return;

      if (member.initializer.kind !== ts.SyntaxKind.StringLiteral) return;
      componentName = member.initializer.text;
    });

    return componentName;
  };

  console.log(chalk.yellowBright("Generating type caches"));
  files.forEach((file) => {
    const { path: filePath, name: fileName } = file;
    const program = ts.createProgram([filePath], { allowJs: true });
    const src = program.getSourceFile(filePath);

    if (!src) return;

    ts.forEachChild(src, (node) => {
      if (ts.isClassDeclaration(node)) {
        const superParent = getSuperParent(node);
        const interfaceType = getInterfaceType(node);

        const className = node.name?.escapedText;
        const componentName = getComponentName(node.members);

        if (!superParent) return;
        if (!className) return;

        const isDefaultExport = src.text.includes(
          `export default ${className}`,
        );

        // check for no name
        if (!componentName) {
          console.log(
            `${chalk.grey(`${fileName}: `)}${
              chalk.yellow(`<${className}> has no `)
            }${chalk.red(`static componentName; skipping`)}`,
          );

          return;
        }

        canGenFiles.push({
          className,
          interfaceType,
          componentName,
          filePath,
          isDefault: isDefaultExport,
        });
      }
    });
  });

  console.log(chalk.greenBright("Type cache built"));

  console.log(chalk.yellowBright("Writing component-types.d.ts..."));

  let componentTypes = "";
  const tagNameMap: Record<string, string> = {};

  const imports = canGenFiles.map((genFile) => {
    const { componentName, filePath, className, isDefault } = genFile;
    tagNameMap[componentName] = `++${className};++`;

    const importStr = isDefault ? `${className}` : `{ ${className} }`;

    return `import ${importStr} from "${filePath.replace(cwd, ".")}";`;
  });

  componentTypes = componentTypes.concat(imports.join("\n") + "\n");
  componentTypes = componentTypes.concat(`\ntype AdditionalTypes = {
    ref?: string;
    style?: Partial<CSSStyleDeclaration>;
    children?: HTMLElement;
  } & Partial<Omit<HTMLElement, "style">>;\n\n`);
  componentTypes = componentTypes.concat(`declare global {
  interface HTMLElementTagNameMap `);
  componentTypes = componentTypes.concat(JSON.stringify(tagNameMap, null, 2));

  componentTypes = componentTypes.concat(`namespace JSX {
  interface IntrinsicElements `);

  const jsx: Record<string, string> = {};

  canGenFiles.forEach((genFile) => {
    const { componentName, interfaceType, filePath } = genFile;
    const importInterfaceStr = interfaceType
      ? `++import('${filePath.replace(cwd, ".")}').${interfaceType} & `
      : "++";

    jsx[componentName] = `${importInterfaceStr}AdditionalTypes;++`;
  });

  componentTypes = componentTypes.concat(JSON.stringify(jsx, null, 2));

  componentTypes = componentTypes.concat("}");
  componentTypes = componentTypes.concat("}");

  componentTypes = componentTypes
    .replace("}}", "  }\n}")
    .replaceAll('"++', "")
    .replaceAll(';++"', "");

  Deno.writeFileSync(join(cwd, COMPONENT_DTS), Buffer.from(componentTypes));
  new Deno.Command("deno", {
    cwd,
    args: ["fmt", COMPONENT_DTS],
  }).outputSync();

  addToDenoJson();
};

if (import.meta.main) buildDocs();
