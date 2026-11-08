"use client";

import { useState, useEffect } from "react";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  views: number;
}

export default function KnowledgeBase() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      fetchArticles();
    }
  }, [searchQuery]);

  const fetchArticles = async () => {
    try {
      const res = await fetch(`/api/support/kb/search?q=${searchQuery}`);
      if (res.ok) {
        const { articles } = await res.json();
        setArticles(articles);
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Knowledge Base</h1>
          <p className="text-gray-600">Find answers to common questions</p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for help..."
            className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Articles List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-bold text-gray-900">Articles</h2>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {articles.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-gray-600">
                    {searchQuery
                      ? "No articles found"
                      : "Search to find articles"}
                  </div>
                ) : (
                  articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      className={`w-full text-left px-6 py-4 hover:bg-gray-50 transition ${
                        selectedArticle?.id === article.id
                          ? "bg-blue-50 border-l-4 border-blue-600"
                          : ""
                      }`}
                    >
                      <p className="font-medium text-gray-900 text-sm">
                        {article.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {article.views} views
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Article Content */}
          <div className="lg:col-span-2">
            {selectedArticle ? (
              <div className="bg-white rounded-lg shadow-lg p-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  {selectedArticle.title}
                </h2>
                <div className="flex gap-4 mb-6">
                  <span className="text-sm text-gray-500">
                    Category: {selectedArticle.category}
                  </span>
                  <span className="text-sm text-gray-500">
                    {selectedArticle.views} views
                  </span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {selectedArticle.content}
                  </p>
                </div>
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-4">Was this helpful?</p>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition">
                      👍 Yes
                    </button>
                    <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition">
                      👎 No
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                <p className="text-gray-600">
                  Search for an article or browse our knowledge base
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
