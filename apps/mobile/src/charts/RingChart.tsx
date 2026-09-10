import React from "react";
import { Ring, type RingProps } from "../ui/Ring";
import { Text } from "../ui/Text";

export interface RingChartProps extends Omit<RingProps, "children"> {
  /** Big number inside the ring (already formatted). */
  label: string;
  caption?: string;
}

/** Hero ring with a tabular number + caption in the middle (calories, recovery, score). */
export function RingChart({ label, caption, size = 132, ...rest }: RingChartProps) {
  const big = size >= 120 ? "display" : size >= 80 ? "heading" : "title";
  return (
    <Ring size={size} {...rest}>
      <Text variant={big} tabular align="center" numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      {caption ? (
        <Text variant="caption" color="inkMuted" align="center">
          {caption}
        </Text>
      ) : null}
    </Ring>
  );
}
