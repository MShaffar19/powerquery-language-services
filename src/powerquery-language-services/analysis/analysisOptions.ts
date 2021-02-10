// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ILibrary } from "../library/library";
import { ISymbolProvider } from "../providers/commonTypes";
import { WorkspaceCache } from "../workspaceCache";

export interface AnalysisOptions {
    readonly createLibrarySymbolProviderFn?: (library: ILibrary) => ISymbolProvider;
    readonly createLocalDocumentSymbolProviderFn?: (
        library: ILibrary,
        maybeTriedInspection: WorkspaceCache.TInspectionCacheItem | undefined,
    ) => ISymbolProvider;
    readonly locale?: string;
    readonly maintainWorkspaceCache?: boolean;
}
