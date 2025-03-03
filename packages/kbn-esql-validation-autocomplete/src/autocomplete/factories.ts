/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import { SuggestionRawDefinition } from './types';
import { groupingFunctionDefinitions } from '../definitions/grouping';
import { statsAggregationFunctionDefinitions } from '../definitions/aggs';
import { evalFunctionDefinitions } from '../definitions/functions';
import { getFunctionSignatures, getCommandSignature } from '../definitions/helpers';
import { timeUnitsToSuggest } from '../definitions/literals';
import {
  FunctionDefinition,
  CommandDefinition,
  CommandOptionsDefinition,
  CommandModeDefinition,
} from '../definitions/types';
import { shouldBeQuotedSource, getCommandDefinition, shouldBeQuotedText } from '../shared/helpers';
import { buildDocumentation, buildFunctionDocumentation } from './documentation_util';
import { DOUBLE_BACKTICK, SINGLE_TICK_REGEX } from '../shared/constants';
import type { ESQLRealField } from '../validation/types';

const allFunctions = statsAggregationFunctionDefinitions
  .concat(evalFunctionDefinitions)
  .concat(groupingFunctionDefinitions);

export const TIME_SYSTEM_PARAMS = ['?start', '?end'];

export const TRIGGER_SUGGESTION_COMMAND = {
  title: 'Trigger Suggestion Dialog',
  id: 'editor.action.triggerSuggest',
};

export function getSafeInsertText(text: string, options: { dashSupported?: boolean } = {}) {
  return shouldBeQuotedText(text, options)
    ? `\`${text.replace(SINGLE_TICK_REGEX, DOUBLE_BACKTICK)}\``
    : text;
}
export function getQuotedText(text: string) {
  return text.startsWith(`"`) && text.endsWith(`"`) ? text : `"${text}"`;
}

function getSafeInsertSourceText(text: string) {
  return shouldBeQuotedSource(text) ? getQuotedText(text) : text;
}

export function getSuggestionFunctionDefinition(fn: FunctionDefinition): SuggestionRawDefinition {
  const fullSignatures = getFunctionSignatures(fn, { capitalize: true, withTypes: true });
  return {
    label: fullSignatures[0].declaration,
    text: `${fn.name.toUpperCase()}($0)`,
    asSnippet: true,
    kind: 'Function',
    detail: fn.description,
    documentation: {
      value: buildFunctionDocumentation(fullSignatures, fn.examples),
    },
    // agg functgions have priority over everything else
    sortText: fn.type === 'agg' ? '1A' : 'C',
    // trigger a suggestion follow up on selection
    command: TRIGGER_SUGGESTION_COMMAND,
  };
}

export function getSuggestionBuiltinDefinition(fn: FunctionDefinition): SuggestionRawDefinition {
  const hasArgs = fn.signatures.some(({ params }) => params.length > 1);
  return {
    label: fn.name.toUpperCase(),
    text: hasArgs ? `${fn.name.toUpperCase()} $0` : fn.name.toUpperCase(),
    asSnippet: hasArgs,
    kind: 'Operator',
    detail: fn.description,
    documentation: {
      value: '',
    },
    sortText: 'D',
    command: hasArgs ? TRIGGER_SUGGESTION_COMMAND : undefined,
  };
}

export const getCompatibleFunctionDefinition = (
  command: string,
  option: string | undefined,
  returnTypes?: string[],
  ignored: string[] = []
): SuggestionRawDefinition[] => {
  const fnSupportedByCommand = allFunctions
    .filter(
      ({ name, supportedCommands, supportedOptions }) =>
        (option ? supportedOptions?.includes(option) : supportedCommands.includes(command)) &&
        !ignored.includes(name)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!returnTypes) {
    return fnSupportedByCommand.map(getSuggestionFunctionDefinition);
  }
  return fnSupportedByCommand
    .filter((mathDefinition) =>
      mathDefinition.signatures.some(
        (signature) => returnTypes[0] === 'any' || returnTypes.includes(signature.returnType)
      )
    )
    .map(getSuggestionFunctionDefinition);
};

export function getSuggestionCommandDefinition(
  command: CommandDefinition
): SuggestionRawDefinition {
  const commandDefinition = getCommandDefinition(command.name);
  const commandSignature = getCommandSignature(commandDefinition);
  return {
    label: commandDefinition.name.toUpperCase(),
    text: commandDefinition.signature.params.length
      ? `${commandDefinition.name.toUpperCase()} $0`
      : commandDefinition.name.toUpperCase(),
    asSnippet: true,
    kind: 'Method',
    detail: commandDefinition.description,
    documentation: {
      value: buildDocumentation(commandSignature.declaration, commandSignature.examples),
    },
    sortText: 'A',
    command: TRIGGER_SUGGESTION_COMMAND,
  };
}

export const buildFieldsDefinitionsWithMetadata = (
  fields: ESQLRealField[]
): SuggestionRawDefinition[] => {
  return fields.map((field) => {
    const description = field.metadata?.description;

    const titleCaseType = field.type.charAt(0).toUpperCase() + field.type.slice(1);
    return {
      label: field.name,
      text: getSafeInsertText(field.name),
      kind: 'Variable',
      detail: titleCaseType,
      documentation: description
        ? {
            value: `
---

${description}`,
          }
        : undefined,
      // If there is a description, it is a field from ECS, so it should be sorted to the top
      sortText: description ? '1D' : 'D',
    };
  });
};

export const buildFieldsDefinitions = (fields: string[]): SuggestionRawDefinition[] => {
  return fields.map((label) => ({
    label,
    text: getSafeInsertText(label),
    kind: 'Variable',
    detail: i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.fieldDefinition', {
      defaultMessage: `Field specified by the input table`,
    }),
    sortText: 'D',
  }));
};
export const buildVariablesDefinitions = (variables: string[]): SuggestionRawDefinition[] =>
  variables.map((label) => ({
    label,
    text: label,
    kind: 'Variable',
    detail: i18n.translate(
      'kbn-esql-validation-autocomplete.esql.autocomplete.variableDefinition',
      {
        defaultMessage: `Variable specified by the user within the ES|QL query`,
      }
    ),
    sortText: 'D',
  }));

export const buildSourcesDefinitions = (
  sources: Array<{ name: string; isIntegration: boolean; title?: string }>
): SuggestionRawDefinition[] =>
  sources.map(({ name, isIntegration, title }) => ({
    label: title ?? name,
    text: getSafeInsertSourceText(name),
    isSnippet: isIntegration,
    ...(isIntegration && { command: TRIGGER_SUGGESTION_COMMAND }),
    kind: isIntegration ? 'Class' : 'Issue',
    detail: isIntegration
      ? i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.integrationDefinition', {
          defaultMessage: `Integration`,
        })
      : i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.sourceDefinition', {
          defaultMessage: `Index`,
        }),
    sortText: 'A',
  }));

export const buildConstantsDefinitions = (
  userConstants: string[],
  detail?: string,
  sortText?: string
): SuggestionRawDefinition[] =>
  userConstants.map((label) => ({
    label,
    text: label,
    kind: 'Constant',
    detail:
      detail ??
      i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.constantDefinition', {
        defaultMessage: `Constant`,
      }),
    sortText: sortText ?? 'A',
  }));

export const buildValueDefinitions = (
  values: string[],
  detail?: string
): SuggestionRawDefinition[] =>
  values.map((value) => ({
    label: `"${value}"`,
    text: `"${value}"`,
    detail:
      detail ??
      i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.valueDefinition', {
        defaultMessage: 'Literal value',
      }),
    kind: 'Value',
  }));

export const buildNewVarDefinition = (label: string): SuggestionRawDefinition => {
  return {
    label,
    text: `${label} =`,
    kind: 'Variable',
    detail: i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.newVarDoc', {
      defaultMessage: 'Define a new variable',
    }),
    sortText: '1',
  };
};

export const buildPoliciesDefinitions = (
  policies: Array<{ name: string; sourceIndices: string[] }>
): SuggestionRawDefinition[] =>
  policies.map(({ name: label, sourceIndices }) => ({
    label,
    text: getSafeInsertText(label, { dashSupported: true }),
    kind: 'Class',
    detail: i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.policyDefinition', {
      defaultMessage: `Policy defined on {count, plural, one {index} other {indices}}: {indices}`,
      values: {
        count: sourceIndices.length,
        indices: sourceIndices.join(', '),
      },
    }),
    sortText: 'D',
  }));

export const buildMatchingFieldsDefinition = (
  matchingField: string,
  fields: string[]
): SuggestionRawDefinition[] =>
  fields.map((label) => ({
    label,
    text: getSafeInsertText(label),
    kind: 'Variable',
    detail: i18n.translate(
      'kbn-esql-validation-autocomplete.esql.autocomplete.matchingFieldDefinition',
      {
        defaultMessage: `Use to match on {matchingField} on the policy`,
        values: {
          matchingField,
        },
      }
    ),
    sortText: 'D',
  }));

export const buildOptionDefinition = (
  option: CommandOptionsDefinition,
  isAssignType: boolean = false
) => {
  const completeItem: SuggestionRawDefinition = {
    label: option.name.toUpperCase(),
    text: option.name.toUpperCase(),
    kind: 'Reference',
    detail: option.description,
    sortText: '1',
  };
  if (isAssignType || option.signature.params.length) {
    completeItem.text = isAssignType
      ? `${option.name.toUpperCase()} = $0`
      : `${option.name.toUpperCase()} $0`;
    completeItem.asSnippet = true;
    completeItem.command = TRIGGER_SUGGESTION_COMMAND;
  }
  return completeItem;
};

export const buildSettingDefinitions = (
  setting: CommandModeDefinition
): SuggestionRawDefinition[] => {
  // for now there's just a single setting with one argument
  return setting.values.map(({ name, description }) => ({
    label: `${setting.prefix || ''}${name}`,
    text: `${setting.prefix || ''}${name}:$0`,
    asSnippet: true,
    kind: 'Reference',
    detail: description ? `${setting.description} - ${description}` : setting.description,
    sortText: 'D',
    command: TRIGGER_SUGGESTION_COMMAND,
  }));
};

export const buildNoPoliciesAvailableDefinition = (): SuggestionRawDefinition => ({
  label: i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.noPoliciesLabel', {
    defaultMessage: 'No available policy',
  }),
  text: '',
  kind: 'Issue',
  detail: i18n.translate(
    'kbn-esql-validation-autocomplete.esql.autocomplete.noPoliciesLabelsFound',
    {
      defaultMessage: 'Click to create',
    }
  ),
  sortText: 'D',
  command: {
    id: 'esql.policies.create',
    title: i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.createNewPolicy', {
      defaultMessage: 'Click to create',
    }),
  },
});

export function getUnitDuration(unit: number = 1) {
  const filteredTimeLiteral = timeUnitsToSuggest.filter(({ name }) => {
    const result = /s$/.test(name);
    return unit > 1 ? result : !result;
  });
  return filteredTimeLiteral.map(({ name }) => `${unit} ${name}`);
}

/**
 * Given information about the current command and the parameter type, suggest
 * some literals that may make sense.
 *
 * TODO — this currently tries to cover both command-specific suggestions and type
 * suggestions. We could consider separating the two... or just using parameter types
 * and forgetting about command-specific suggestions altogether.
 *
 * Another thought... should literal suggestions be defined in the definitions file?
 * That approach might allow for greater specificity in the suggestions and remove some
 * "magical" logic. Maybe this is really the same thing as the literalOptions parameter
 * definition property...
 */
export function getCompatibleLiterals(commandName: string, types: string[], names?: string[]) {
  const suggestions: SuggestionRawDefinition[] = [];
  if (types.includes('number')) {
    if (commandName === 'limit') {
      // suggest 10/100/1000 for limit
      suggestions.push(...buildConstantsDefinitions(['10', '100', '1000'], ''));
    }
  }
  if (types.includes('time_literal')) {
    // filter plural for now and suggest only unit + singular
    suggestions.push(...buildConstantsDefinitions(getUnitDuration(1))); // i.e. 1 year
  }
  // this is a special type built from the suggestion system, not inherited from the AST
  if (types.includes('time_literal_unit')) {
    suggestions.push(...buildConstantsDefinitions(timeUnitsToSuggest.map(({ name }) => name))); // i.e. year, month, ...
  }
  if (types.includes('string')) {
    if (names) {
      const index = types.indexOf('string');
      if (/pattern/.test(names[index])) {
        suggestions.push(
          ...buildConstantsDefinitions(
            [commandName === 'grok' ? '"%{WORD:firstWord}"' : '"%{firstWord}"'],
            i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.aPatternString', {
              defaultMessage: 'A pattern string',
            })
          )
        );
      } else {
        suggestions.push(...buildConstantsDefinitions(['string'], ''));
      }
    }
  }
  return suggestions;
}

export function getDateLiterals() {
  return [
    ...buildConstantsDefinitions(
      TIME_SYSTEM_PARAMS,
      i18n.translate('kbn-esql-validation-autocomplete.esql.autocomplete.namedParamDefinition', {
        defaultMessage: 'Named parameter',
      }),
      '1A'
    ),
    {
      label: i18n.translate(
        'kbn-esql-validation-autocomplete.esql.autocomplete.chooseFromTimePickerLabel',
        {
          defaultMessage: 'Choose from the time picker',
        }
      ),
      text: '',
      kind: 'Issue',
      detail: i18n.translate(
        'kbn-esql-validation-autocomplete.esql.autocomplete.chooseFromTimePicker',
        {
          defaultMessage: 'Click to choose',
        }
      ),
      sortText: '1A',
      command: {
        id: 'esql.timepicker.choose',
        title: i18n.translate(
          'kbn-esql-validation-autocomplete.esql.autocomplete.chooseFromTimePicker',
          {
            defaultMessage: 'Click to choose',
          }
        ),
      },
    } as SuggestionRawDefinition,
  ];
}
