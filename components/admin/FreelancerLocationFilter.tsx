"use client";

import { useState } from "react";
import { AButton } from "@/components/admin/ui";
import { LocationRadiusFilter } from "./LocationRadiusFilter";

interface FreelancerData {
  id: string;
  fullName: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

interface FreelancerLocationFilterProps {
  items: FreelancerData[];
  onFilter: (filteredIds: string[]) => void;
}

export function FreelancerLocationFilter({ items, onFilter }: FreelancerLocationFilterProps) {
  const [showFilter, setShowFilter] = useState(false);

  const itemsWithCoords = items.filter((i) => i.latitude && i.longitude).length;

  return (
    <div className="space-y-3">
      <AButton
        onClick={() => setShowFilter(!showFilter)}
      >
        📍 Locatie + Straal ({itemsWithCoords})
      </AButton>

      {showFilter && (
        <LocationRadiusFilter
          items={items}
          onFilter={(ids) => {
            onFilter(ids);
            setShowFilter(false);
          }}
          onClose={() => setShowFilter(false)}
        />
      )}
    </div>
  );
}
