import { z } from 'zod';

/**
 * Contract Repository Module
 * Centralized storage with version control, full-text search, metadata tagging
 */

export const ContractMetadataSchema = z.object({
  titel: z.string(),
  leverancier: z.string(),
  klant: z.string(),
  categorie: z.enum(['KOOP', 'VERKOOP', 'SERVICE', 'PARTNERSHIP', 'OVERIG']),
  waarde: z.number().nonnegative().optional(),
  begindatum: z.coerce.date(),
  einddatum: z.coerce.date().optional(),
  tags: z.string().array().default([]),
  trefwoorden: z.string().array().default([]),
  externe_id: z.string().optional(),
});

export type ContractMetadata = z.infer<typeof ContractMetadataSchema>;

export interface ContractVersionRecord {
  versienummer: number;
  inhoud: string;
  wijzigingen: string;
  gemaaktDoor: string;
  gemaaktOp: Date;
  sha256: string;
}

export interface SearchResult {
  contractId: string;
  titel: string;
  relevantie: number;
  snippet: string;
  metadata: ContractMetadata;
}

export interface RepositoryStats {
  totaalContracts: number;
  contractenPerCategorie: Record<string, number>;
  actieveContracts: number;
  vervallenContracts: number;
  totalWaarde: number;
  laastGewijzigd: Date;
}

export class ContractRepository {
  private versies: Map<string, ContractVersionRecord[]> = new Map();
  private metadata: Map<string, ContractMetadata> = new Map();
  private searchIndex: Map<string, Set<string>> = new Map(); // keyword -> contractIds
  private tags: Map<string, Set<string>> = new Map(); // tag -> contractIds

  /**
   * Store contract with metadata
   */
  async storeContract(
    contractId: string,
    inhoud: string,
    meta: ContractMetadata,
    gemaaktDoor: string
  ): Promise<{ success: boolean; versienummer: number }> {
    try {
      // Create version record
      const versienummer = this.getNextVersionNumber(contractId);
      const sha256 = this.calculateSha256(inhoud);

      const versionRecord: ContractVersionRecord = {
        versienummer,
        inhoud,
        wijzigingen: `Initiale indiening`,
        gemaaktDoor,
        gemaaktOp: new Date(),
        sha256,
      };

      // Store version
      if (!this.versies.has(contractId)) {
        this.versies.set(contractId, []);
      }
      this.versies.get(contractId)!.push(versionRecord);

      // Store metadata
      this.metadata.set(contractId, meta);

      // Update search index
      this.updateSearchIndex(contractId, inhoud, meta);

      // Update tags
      this.updateTagIndex(contractId, meta.tags);

      return { success: true, versienummer };
    } catch (err) {
      return { success: false, versienummer: 0 };
    }
  }

  /**
   * Update contract with new version
   */
  async updateContract(
    contractId: string,
    inhoud: string,
    wijzigingen: string,
    gemaaktDoor: string,
    newMetadata?: Partial<ContractMetadata>
  ): Promise<{ success: boolean; versienummer: number }> {
    try {
      const versienummer = this.getNextVersionNumber(contractId);
      const sha256 = this.calculateSha256(inhoud);

      const versionRecord: ContractVersionRecord = {
        versienummer,
        inhoud,
        wijzigingen,
        gemaaktDoor,
        gemaaktOp: new Date(),
        sha256,
      };

      if (!this.versies.has(contractId)) {
        this.versies.set(contractId, []);
      }
      this.versies.get(contractId)!.push(versionRecord);

      // Update metadata if provided
      if (newMetadata) {
        const huidigeMetadata = this.metadata.get(contractId);
        if (huidigeMetadata) {
          const geupdate = { ...huidigeMetadata, ...newMetadata };
          this.metadata.set(contractId, geupdate);
          this.updateSearchIndex(contractId, inhoud, geupdate);
          if (newMetadata.tags) {
            this.updateTagIndex(contractId, newMetadata.tags);
          }
        }
      }

      return { success: true, versienummer };
    } catch (err) {
      return { success: false, versienummer: 0 };
    }
  }

  /**
   * Get contract by ID
   */
  async getContract(contractId: string): Promise<{
    metadata: ContractMetadata | null;
    laatsteVersie: ContractVersionRecord | null;
    versieGeschiedenis: ContractVersionRecord[];
  } | null> {
    const metadata = this.metadata.get(contractId);
    const versies = this.versies.get(contractId);

    if (!versies || versies.length === 0) {
      return null;
    }

    const laatsteVersie = versies[versies.length - 1];

    return {
      metadata: metadata || null,
      laatsteVersie,
      versieGeschiedenis: versies,
    };
  }

  /**
   * Search contracts by full-text search
   */
  async search(query: string, filters?: { categorie?: string; tag?: string; leverancier?: string }): Promise<SearchResult[]> {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const candidates = new Set<string>();

    // Find contracts matching any term
    queryTerms.forEach(term => {
      const relatedContracts = this.searchIndex.get(term) || new Set();
      relatedContracts.forEach(cid => candidates.add(cid));
    });

    // Apply filters
    let results: string[] = Array.from(candidates);

    if (filters?.categorie) {
      results = results.filter(cid => {
        const meta = this.metadata.get(cid);
        return meta?.categorie === filters.categorie;
      });
    }

    if (filters?.tag) {
      results = results.filter(cid => {
        const meta = this.metadata.get(cid);
        return meta?.tags.includes(filters.tag!);
      });
    }

    if (filters?.leverancier) {
      results = results.filter(cid => {
        const meta = this.metadata.get(cid);
        return meta?.leverancier.toLowerCase().includes(filters.leverancier!.toLowerCase());
      });
    }

    // Convert to search results
    return results.map(contractId => {
      const meta = this.metadata.get(contractId);
      const versies = this.versies.get(contractId);
      const inhoud = versies?.[versies.length - 1]?.inhoud || '';

      return {
        contractId,
        titel: meta?.titel || 'Onbekend',
        relevantie: this.calculateRelevance(inhoud, queryTerms),
        snippet: this.generateSnippet(inhoud, query),
        metadata: meta || ContractMetadataSchema.parse({}),
      };
    }).sort((a, b) => b.relevantie - a.relevantie).slice(0, 50);
  }

  /**
   * Get contracts by tag
   */
  async getByTag(tag: string): Promise<string[]> {
    return Array.from(this.tags.get(tag) || new Set());
  }

  /**
   * Get contracts by category
   */
  async getByCategory(categorie: ContractMetadata['categorie']): Promise<string[]> {
    const results: string[] = [];
    this.metadata.forEach((meta, contractId) => {
      if (meta.categorie === categorie) {
        results.push(contractId);
      }
    });
    return results;
  }

  /**
   * Get repository statistics
   */
  async getStatistics(): Promise<RepositoryStats> {
    const stats: RepositoryStats = {
      totaalContracts: this.metadata.size,
      contractenPerCategorie: {},
      actieveContracts: 0,
      vervallenContracts: 0,
      totalWaarde: 0,
      laastGewijzigd: new Date(),
    };

    const nu = new Date();
    const categorieTotalen: Record<string, number> = {};

    this.metadata.forEach((meta, contractId) => {
      // Count by category
      categorieTotalen[meta.categorie] = (categorieTotalen[meta.categorie] || 0) + 1;

      // Count active/expired
      if (meta.einddatum) {
        if (meta.einddatum > nu) {
          stats.actieveContracts++;
        } else {
          stats.vervallenContracts++;
        }
      } else {
        stats.actieveContracts++;
      }

      // Total value
      if (meta.waarde) {
        stats.totalWaarde += meta.waarde;
      }

      // Track last modified
      const versies = this.versies.get(contractId);
      if (versies && versies.length > 0) {
        const lastVersie = versies[versies.length - 1];
        if (lastVersie.gemaaktOp > stats.laastGewijzigd) {
          stats.laastGewijzigd = lastVersie.gemaaktOp;
        }
      }
    });

    stats.contractenPerCategorie = categorieTotalen;
    return stats;
  }

  /**
   * Export contract as PDF/DOCX
   */
  async exportContract(contractId: string, format: 'PDF' | 'DOCX' = 'PDF'): Promise<Buffer | null> {
    const contract = await this.getContract(contractId);
    if (!contract) return null;

    // In production, would use a library like pdfkit or docx
    // For now, return mock buffer
    const inhoud = contract.laatsteVersie?.inhoud || '';
    return Buffer.from(inhoud, 'utf-8');
  }

  /**
   * Update search index
   */
  private updateSearchIndex(contractId: string, inhoud: string, meta: ContractMetadata): void {
    const allTerms = this.extractTerms(inhoud, meta);

    allTerms.forEach(term => {
      if (!this.searchIndex.has(term)) {
        this.searchIndex.set(term, new Set());
      }
      this.searchIndex.get(term)!.add(contractId);
    });
  }

  /**
   * Update tag index
   */
  private updateTagIndex(contractId: string, tags: string[]): void {
    tags.forEach(tag => {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(contractId);
    });
  }

  /**
   * Extract searchable terms
   */
  private extractTerms(inhoud: string, meta: ContractMetadata): string[] {
    const terms = new Set<string>();

    // Add metadata terms
    [meta.titel, meta.leverancier, meta.klant, meta.categorie]
      .filter(Boolean)
      .forEach(term => {
        term!.toLowerCase().split(/\s+/).forEach(t => terms.add(t));
      });

    // Add content terms (simplified)
    inhoud.toLowerCase().split(/\s+/).forEach(term => {
      if (term.length > 3) terms.add(term);
    });

    // Add tags
    meta.tags.forEach(tag => terms.add(tag.toLowerCase()));

    return Array.from(terms);
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(inhoud: string, queryTerms: string[]): number {
    let score = 0;
    const lowerInhoud = inhoud.toLowerCase();

    queryTerms.forEach(term => {
      const count = (lowerInhoud.match(new RegExp(term, 'g')) || []).length;
      score += count;
    });

    return Math.min(100, score);
  }

  /**
   * Generate snippet around search term
   */
  private generateSnippet(inhoud: string, query: string, contextLength: number = 100): string {
    const lowerInhoud = inhoud.toLowerCase();
    const index = lowerInhoud.indexOf(query.toLowerCase());

    if (index === -1) return inhoud.substring(0, contextLength) + '...';

    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(inhoud.length, index + contextLength / 2);

    return (start > 0 ? '...' : '') + inhoud.substring(start, end) + (end < inhoud.length ? '...' : '');
  }

  /**
   * Get next version number
   */
  private getNextVersionNumber(contractId: string): number {
    const versies = this.versies.get(contractId);
    return versies ? versies.length + 1 : 1;
  }

  /**
   * Calculate SHA256 hash (simplified)
   */
  private calculateSha256(inhoud: string): string {
    return `sha256-${Buffer.from(inhoud).toString('base64').substring(0, 16)}`;
  }
}
