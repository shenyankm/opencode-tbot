import ts from "typescript";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("..", import.meta.url)));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
let failures = 0;
for (const source of program.getSourceFiles().filter((source) => parsed.fileNames.includes(source.fileName))) {
    function visit(node) {
        if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
            const type = checker.getTypeAtLocation(node.expression);
            if (type.getProperty("then")) {
                const { line } = source.getLineAndCharacterOfPosition(node.getStart());
                console.error(`${source.fileName}:${line + 1}: Await, return, or explicitly void this Promise.`);
                failures++;
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
}
if (failures) process.exitCode = 1;
else console.log("No floating Promise call statements in src.");
