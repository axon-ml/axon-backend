import * as pg from "pg";

import {Service} from "./service";
import {Request, Response, Router} from "express";
import {createLogger} from "../logger";
import {HttpCodes} from "../httpcodes";
import {ICodegenBackend} from "../compiler/codegen";
import {IModel} from "../compiler/types";

const LOGGER = createLogger("CompileService");

interface CodegenReply {
    generated: string;
}

export class CompileService extends Service {
    private db: pg.Pool;
    private codegen: ICodegenBackend;

    constructor(codegen: ICodegenBackend, db: pg.Pool) {
        super();
        this.codegen = codegen;
        this.db = db;
    }

    protected setupRoutes(): Router {
        return Router()
            .get("/gen/:modelId", (req, res) => this.handleGenerateModel(req, res))
            .post("/gen", (req, res) => this.handleGenerateRaw(req, res));
    }

    private handleGenerateModel(req: Request, res: Response) {
        let {modelId} = req.params; // Grab the path params.
        modelId = parseInt(modelId);

        const query = `
        SELECT id, repr, version
        FROM models
        WHERE id = $1::INTEGER
        ORDER BY version DESC
        LIMIT 1
        `;
        LOGGER.info(`/generate/${modelId}`);
        this.db.query(query, [modelId], (err, result) => {
            if (err) {
                return res.status(500).send(err);
            }

            if (result.rowCount === 0) {
                return res.status(HttpCodes.BAD_REQUEST).send(`No such model with ID ${modelId}`);
            }

            const {id, repr, version} = result.rows[0];

            try {
                const model = JSON.parse(repr) as IModel;
                // Return compiled output.
                return res.json({
                    generated: this.codegen.generate(model),
                } as CodegenReply);
            } catch (err) {
                return res.status(HttpCodes.NOT_FOUND).send(err);
            }
        });
    }

    private handleGenerateRaw(req: Request, res: Response) {
        const ast = req.body as IModel; // Assume it's a model.
        try {
            // TODO: Perform some verification of the model before passing to the Codegen backend.
            // return res.json({
            //     generated: this.codegen.generate(ast),
            // } as CodegenReply);
            return res.send(this.codegen.generate(ast));
        } catch (err) {
            // Catch any errors, send it back to the requester.
            return res.status(HttpCodes.INTERNAL_SERVER_ERROR).send(err);
        }
    }
}
