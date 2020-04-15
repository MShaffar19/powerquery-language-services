// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as PQP from "@microsoft/powerquery-parser";
import { CompletionItem, Hover, Position, Range, SignatureHelp, TextDocument } from "vscode-languageserver-types";

import { InspectionUtils, LanguageServiceUtils, WorkspaceCache } from ".";
import { CurrentDocumentSymbolProvider } from "./currentDocumentSymbolProvider";
import { KeywordProvider } from "./keywordProvider";
import {
    CompletionItemProviderContext,
    HoverProviderContext,
    LibrarySymbolProvider,
    NullLibrarySymbolProvider,
    SignatureProviderContext,
    SymbolProvider,
} from "./providers";

export interface Analysis {
    getCompletionItems(): Promise<CompletionItem[]>;
    getHover(): Promise<Hover>;
    getSignatureHelp(): Promise<SignatureHelp>;
}

export interface AnalysisOptions {
    readonly environmentSymbolProvider?: SymbolProvider;
    readonly librarySymbolProvider?: LibrarySymbolProvider;
}

export function createAnalysisSession(document: TextDocument, position: Position, options: AnalysisOptions): Analysis {
    return new DocumentAnalysis(document, position, options);
}

class DocumentAnalysis implements Analysis {
    private readonly maybeTriedInspection: undefined | PQP.Task.TriedInspection;
    private readonly environmentSymbolProvider: SymbolProvider;
    private readonly keywordProvider: KeywordProvider;
    private readonly librarySymbolProvider: LibrarySymbolProvider;
    private readonly localSymbolProvider: SymbolProvider;

    constructor(
        private readonly document: TextDocument,
        private readonly position: Position,
        options: AnalysisOptions,
    ) {
        this.maybeTriedInspection = WorkspaceCache.maybeTriedInspection(this.document, this.position);

        this.environmentSymbolProvider = options.environmentSymbolProvider
            ? options.environmentSymbolProvider
            : new NullLibrarySymbolProvider();
        this.keywordProvider = new KeywordProvider(this.maybeTriedInspection);
        this.librarySymbolProvider = options.librarySymbolProvider
            ? options.librarySymbolProvider
            : new NullLibrarySymbolProvider();
        this.localSymbolProvider = new CurrentDocumentSymbolProvider(this.maybeTriedInspection);
    }

    public async getCompletionItems(): Promise<CompletionItem[]> {
        let context: CompletionItemProviderContext = {};

        const maybeToken: undefined | PQP.LineToken = maybeTokenAt(this.document, this.position);
        if (maybeToken !== undefined) {
            context = {
                range: getTokenRangeForPosition(maybeToken, this.position),
                text: maybeToken.data,
                tokenKind: maybeToken.kind,
            };
        }

        // TODO: intellisense improvements
        // - honor expected data type
        // - get inspection for current scope
        // - only include current query name after @
        // - don't return completion items when on lefthand side of assignment

        // TODO: add tracing/logging to the catch()
        const getLibraryCompletionItems: Promise<CompletionItem[]> = this.librarySymbolProvider
            .getCompletionItems(context)
            .catch(() => {
                return LanguageServiceUtils.EmptyCompletionItems;
            });
        const getKeywords: Promise<CompletionItem[]> = this.keywordProvider.getCompletionItems(context).catch(() => {
            return LanguageServiceUtils.EmptyCompletionItems;
        });
        const getEnvironmentCompletionItems: Promise<CompletionItem[]> = this.environmentSymbolProvider
            .getCompletionItems(context)
            .catch(() => {
                return LanguageServiceUtils.EmptyCompletionItems;
            });
        const getLocalCompletionItems: Promise<CompletionItem[]> = this.localSymbolProvider
            .getCompletionItems(context)
            .catch(() => {
                return LanguageServiceUtils.EmptyCompletionItems;
            });

        const [libraryResponse, keywordResponse, environmentResponse, localResponse] = await Promise.all([
            getLibraryCompletionItems,
            getKeywords,
            getEnvironmentCompletionItems,
            getLocalCompletionItems,
        ]);

        let completionItems: CompletionItem[] = Array.isArray(keywordResponse) ? keywordResponse : [keywordResponse];
        completionItems = completionItems.concat(libraryResponse, environmentResponse, localResponse);

        return completionItems;
    }

    public async getHover(): Promise<Hover> {
        const identifierToken: PQP.LineToken | undefined = maybeIdentifierAt(this.document, this.position);
        if (identifierToken) {
            const context: HoverProviderContext = {
                range: getTokenRangeForPosition(identifierToken, this.position),
                identifier: identifierToken.data,
            };

            // TODO: add tracing/logging to the catch()
            const getLibraryHover: Promise<Hover | null> = this.librarySymbolProvider.getHover(context).catch(() => {
                // tslint:disable-next-line: no-null-keyword
                return null;
            });

            // TODO: use other providers
            // TODO: define priority when multiple providers return results
            const [libraryResponse] = await Promise.all([getLibraryHover]);
            if (libraryResponse) {
                return libraryResponse;
            }
        }

        return LanguageServiceUtils.EmptyHover;
    }

    public async getSignatureHelp(): Promise<SignatureHelp> {
        const triedInspection: PQP.Task.TriedInspection | undefined = WorkspaceCache.maybeTriedInspection(
            this.document,
            this.position,
        );
        if (triedInspection === undefined || PQP.ResultUtils.isErr(triedInspection)) {
            return LanguageServiceUtils.EmptySignatureHelp;
        }
        const inspected: PQP.Task.InspectionOk = triedInspection.value;

        const maybeContext: SignatureProviderContext | undefined = InspectionUtils.maybeSignatureProviderContext(
            inspected,
        );
        if (maybeContext === undefined) {
            return LanguageServiceUtils.EmptySignatureHelp;
        }
        const context: SignatureProviderContext = maybeContext;

        if (context.maybeFunctionName === undefined) {
            return LanguageServiceUtils.EmptySignatureHelp;
        }

        // TODO: add tracing/logging to the catch()
        const librarySignatureHelp: Promise<SignatureHelp | null> = this.librarySymbolProvider
            .getSignatureHelp(context)
            .catch(() => {
                // tslint:disable-next-line: no-null-keyword
                return null;
            });

        const [libraryResponse] = await Promise.all([librarySignatureHelp]);

        return libraryResponse ?? LanguageServiceUtils.EmptySignatureHelp;
    }
}

function getTokenRangeForPosition(token: PQP.LineToken, cursorPosition: Position): Range {
    return {
        start: {
            line: cursorPosition.line,
            character: token.positionStart,
        },
        end: {
            line: cursorPosition.line,
            character: token.positionEnd,
        },
    };
}

function maybeIdentifierAt(document: TextDocument, position: Position): undefined | PQP.LineToken {
    const maybeToken: undefined | PQP.LineToken = maybeTokenAt(document, position);
    if (maybeToken) {
        const token: PQP.LineToken = maybeToken;
        if (token.kind === PQP.LineTokenKind.Identifier) {
            return token;
        }
    }

    return undefined;
}

function maybeLineTokensAt(document: TextDocument, position: Position): undefined | ReadonlyArray<PQP.LineToken> {
    const lexResult: PQP.Lexer.State = WorkspaceCache.getLexerState(document);
    const maybeLine: undefined | PQP.Lexer.TLine = lexResult.lines[position.line];

    return maybeLine !== undefined ? maybeLine.tokens : undefined;
}

function maybeTokenAt(document: TextDocument, position: Position): undefined | PQP.LineToken {
    const maybeLineTokens: undefined | ReadonlyArray<PQP.LineToken> = maybeLineTokensAt(document, position);

    if (maybeLineTokens === undefined) {
        return undefined;
    }

    const lineTokens: ReadonlyArray<PQP.LineToken> = maybeLineTokens;

    for (const token of lineTokens) {
        if (token.positionStart <= position.character && token.positionEnd >= position.character) {
            return token;
        }
    }

    // Token wasn't found - check for special case where current position is a trailing "." on an identifier
    const currentRange: Range = {
        start: {
            line: position.line,
            character: position.character - 1,
        },
        end: position,
    };

    if (document.getText(currentRange) === ".") {
        for (const token of lineTokens) {
            if (token.positionStart <= position.character - 1 && token.positionEnd >= position.character - 1) {
                if (token.kind === PQP.LineTokenKind.Identifier) {
                    // Use this token with an adjusted position
                    return {
                        data: `${token.data}.`,
                        kind: token.kind,
                        positionStart: token.positionStart,
                        positionEnd: token.positionEnd + 1,
                    };
                }
            }
        }
    }

    return undefined;
}