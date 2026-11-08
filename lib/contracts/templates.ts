import { z } from 'zod';

/**
 * Contract Templates Module
 * Handles creation, management, and retrieval of contract templates
 * with smart variables and conditional clauses
 */

export const TemplateVariableSchema = z.object({
  type: z.enum(['TEXT', 'DATE', 'AMOUNT', 'EMAIL', 'PHONE', 'SELECT']),
  label: z.string(),
  required: z.boolean().default(true),
  description: z.string().optional(),
  options: z.string().array().optional(),
  defaultValue: z.string().optional(),
});

export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;

export const SmartClauseSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: z.string(), // Template text with variable substitution
  conditions: z.record(z.string(), z.any()).optional(), // Conditions for including clause
  priority: z.number().default(0),
  category: z.enum(['PAYMENT', 'LIABILITY', 'TERMINATION', 'CONFIDENTIALITY', 'DISPUTE', 'OTHER']),
});

export type SmartClause = z.infer<typeof SmartClauseSchema>;

export const ContractTemplateInputSchema = z.object({
  naam: z.string().min(1, 'Template naam is verplicht'),
  beschrijving: z.string().optional(),
  categorie: z.enum(['KOOP', 'VERKOOP', 'SERVICE', 'PARTNERSHIP']),
  inhoud: z.string().min(1, 'Template inhoud is verplicht'),
  variabelen: z.record(TemplateVariableSchema),
  slimmeClausules: SmartClauseSchema.array().optional(),
  tags: z.string().array().default([]),
  gepubliceerd: z.boolean().default(false),
});

export type ContractTemplateInput = z.infer<typeof ContractTemplateInputSchema>;

export class TemplateManager {
  /**
   * Validate template structure and variables
   */
  static validateTemplate(template: ContractTemplateInput): { valid: boolean; errors?: string[] } {
    try {
      ContractTemplateInputSchema.parse(template);

      // Validate that all variables in template are defined
      const variabeleMatches = template.inhoud.match(/\{\{(\w+)\}\}/g) || [];
      const gevondenVariabelen = new Set(variabeleMatches.map(m => m.slice(2, -2)));

      const errors: string[] = [];
      gevondenVariabelen.forEach(var_naam => {
        if (!template.variabelen[var_naam]) {
          errors.push(`Variabele '${var_naam}' gebruikt maar niet gedefinieerd`);
        }
      });

      return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    } catch (err) {
      return { valid: false, errors: [err instanceof Error ? err.message : 'Onbekende fout'] };
    }
  }

  /**
   * Extract variables from template
   */
  static extractVariables(template: ContractTemplateInput): string[] {
    const matches = template.inhoud.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map(m => m.slice(2, -2));
  }

  /**
   * Recommend smart clauses based on template category
   */
  static recommendSmartClauses(categorie: ContractTemplateInput['categorie']): SmartClause[] {
    const defaultClauses: Record<string, SmartClause[]> = {
      'KOOP': [
        {
          id: 'koop-betaling',
          name: 'Betalingscondities',
          template: 'Betaling dient plaats te vinden binnen {{paymentTerms}} dagen na factuurdatum.',
          category: 'PAYMENT',
          priority: 10,
        },
        {
          id: 'koop-aansprakelijkheid',
          name: 'Leveranciersaansprakelijkheid',
          template: 'Leverancier is aansprakelijk voor directe schade tot een bedrag van {{maxLiability}} euro.',
          category: 'LIABILITY',
          priority: 8,
        },
      ],
      'VERKOOP': [
        {
          id: 'verkoop-betaling',
          name: 'Betalingseisen',
          template: 'Klant betaalt {{percentage}}% vooruit en {{remaining}}% na levering.',
          category: 'PAYMENT',
          priority: 10,
        },
      ],
      'SERVICE': [
        {
          id: 'service-sla',
          name: 'Service Level Agreement',
          template: 'Diensten worden geleverd met {{uptime}}% beschikbaarheid gedurende kantooruren.',
          category: 'OTHER',
          priority: 9,
        },
      ],
      'PARTNERSHIP': [
        {
          id: 'partnership-confidentiality',
          name: 'Vertrouwelijkheid',
          template: 'Beide partijen verplichten zich tot geheimhouding van {{scope}} voor {{duration}} jaar.',
          category: 'CONFIDENTIALITY',
          priority: 8,
        },
      ],
    };

    return defaultClauses[categorie] || [];
  }

  /**
   * Clone template with new version
   */
  static createTemplateVersion(
    baseTemplate: ContractTemplateInput,
    wijzigingen: Partial<ContractTemplateInput>
  ): ContractTemplateInput {
    return {
      ...baseTemplate,
      ...wijzigingen,
      tags: Array.from(new Set([...baseTemplate.tags, 'versie-2'])),
    };
  }
}
