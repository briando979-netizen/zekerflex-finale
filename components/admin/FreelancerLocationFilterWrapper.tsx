"use client";

import { FreelancerLocationFilter } from "./FreelancerLocationFilter";

interface FreelancerData {
  id: string;
  fullName: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

interface FreelancerLocationFilterWrapperProps {
  items: FreelancerData[];
}

export function FreelancerLocationFilterWrapper({ items }: FreelancerLocationFilterWrapperProps) {
  return (
    <FreelancerLocationFilter
      items={items}
      onFilter={(ids) => {
        // TODO: Connect to DataTable filter state
        console.log("Selected freelancers by radius:", ids);
      }}
    />
  );
}
