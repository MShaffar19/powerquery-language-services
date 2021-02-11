// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import "mocha";
import {
    AnalysisOptions,
    CompletionItem,
    EmptyHover,
    EmptySignatureHelp,
    Hover,
    NullSymbolProvider,
    SignatureHelp,
    WorkspaceCache,
} from "../../powerquery-language-services";

import { ILibrary } from "../../powerquery-language-services/library/library";
import * as TestConstants from "../testConstants";
import * as TestUtils from "../testUtils";

const IsolatedAnalysisOptions: AnalysisOptions = {
    ...TestConstants.SimpleLibraryAnalysisOptions,
    createLocalDocumentSymbolProviderFn: (
        _library: ILibrary,
        _maybeTriedInspection: WorkspaceCache.TInspectionCacheItem | undefined,
    ) => NullSymbolProvider.singleton(),
};

async function createCompletionItems(text: string): Promise<ReadonlyArray<CompletionItem>> {
    return TestUtils.createCompletionItems(text, TestConstants.SimpleLibrary, IsolatedAnalysisOptions);
}

async function createHover(text: string): Promise<Hover> {
    return TestUtils.createHover(text, TestConstants.SimpleLibrary, IsolatedAnalysisOptions);
}

async function createSignatureHelp(text: string): Promise<SignatureHelp> {
    return TestUtils.createSignatureHelp(text, TestConstants.SimpleLibrary, IsolatedAnalysisOptions);
}

describe(`SimpleLibraryProvider`, async () => {
    describe(`getCompletionItems`, async () => {
        it(`match`, async () => {
            const expected: ReadonlyArray<string> = [TestConstants.TestLibraryName.NumberOne];
            const actual: ReadonlyArray<CompletionItem> = await createCompletionItems("Test.NumberO|");
            TestUtils.assertCompletionItemLabels(expected, actual);
        });

        it(`match multiple`, async () => {
            const actual: ReadonlyArray<CompletionItem> = await createCompletionItems("Test.Numbe|");
            const expected: ReadonlyArray<string> = [
                TestConstants.TestLibraryName.Number,
                TestConstants.TestLibraryName.NumberOne,
            ];
            TestUtils.assertCompletionItemLabels(expected, actual);
        });

        it(`no match`, async () => {
            const actual: ReadonlyArray<CompletionItem> = await createCompletionItems("Unknown|Identifier");
            const expected: ReadonlyArray<string> = [];
            TestUtils.assertCompletionItemLabels(expected, actual);
        });
    });

    describe(`getHover`, async () => {
        it(`match`, async () => {
            const hover: Hover = await createHover("Test.Num|ber");
            TestUtils.assertHover("[library constant] Test.Number: number", hover);
        });

        it(`no match`, async () => {
            const hover: Hover = await createHover("Unknown|Identifier");
            expect(hover).to.equal(EmptyHover);
        });
    });

    describe(`getSignatureHelp`, async () => {
        it(`match, no parameter`, async () => {
            const actual: SignatureHelp = await createSignatureHelp("Unknown|Identifier");
            const expected: TestUtils.AbridgedSignatureHelp = {
                // tslint:disable-next-line: no-null-keyword
                activeParameter: null,
                activeSignature: 0,
            };
            TestUtils.assertSignatureHelp(expected, actual);
        });

        it(`match, first parameter, no literal`, async () => {
            const actual: SignatureHelp = await createSignatureHelp("Test.SquareIfNumber(|");
            const expected: TestUtils.AbridgedSignatureHelp = {
                // tslint:disable-next-line: no-null-keyword
                activeParameter: 0,
                activeSignature: 0,
            };
            TestUtils.assertSignatureHelp(expected, actual);
        });

        it(`match, first parameter, literal, no comma`, async () => {
            const actual: SignatureHelp = await createSignatureHelp("Test.SquareIfNumber(1|");
            const expected: TestUtils.AbridgedSignatureHelp = {
                // tslint:disable-next-line: no-null-keyword
                activeParameter: 0,
                activeSignature: 0,
            };
            TestUtils.assertSignatureHelp(expected, actual);
        });

        it(`match, first parameter, literal, comma`, async () => {
            const actual: SignatureHelp = await createSignatureHelp("Test.SquareIfNumber(1,|");
            const expected: TestUtils.AbridgedSignatureHelp = {
                // tslint:disable-next-line: no-null-keyword
                activeParameter: 1,
                activeSignature: 0,
            };
            TestUtils.assertSignatureHelp(expected, actual);
        });

        it(`no match`, async () => {
            const actual: SignatureHelp = await createSignatureHelp("Unknown|Identifier");
            expect(actual).to.equal(EmptySignatureHelp);
        });
    });
});