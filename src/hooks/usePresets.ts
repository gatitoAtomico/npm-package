import { useCallback, useMemo } from "react";
import useSWR from "swr";
import useNotif from "./useNotif";

export const usePresets = (
  presetKind?: number,
  getPresetsFn:
    | ((params: { presetKind: number }) => Promise<any[]>)
    | null = null,
  deletePresetFn?: (presetId: string) => Promise<void>,
  addPresetFn: (params: {
    presetKind: number;
    name: string;
    data: string;
  }) => Promise<any>
) => {
  const openNotif = useNotif();

  // Use SWR for data fetching with dedicated cache key
  // Only fetch if presetKind is provided
  const {
    data: presets = [],
    error,
    isValidating,
    isLoading,
    mutate: revalidatePresets,
  } = useSWR(
    presetKind !== undefined ? `presets-${presetKind}` : null,
    async () => {
      if (presetKind === undefined) return [];
      return getPresetsFn ? await getPresetsFn({ presetKind }) : [];
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      revalidateOnMount: true,
      dedupingInterval: 30000, // Dedupe requests in a 30-second window
      onError: (err) => {
        console.error("Error fetching presets:", err);
        openNotif("error", {
          message: "Error",
          description: "Failed to fetch presets",
        });
      },
    }
  );

  // Find the default preset (with highest lastUpdated > 0)
  const defaultPreset = useMemo(() => {
    // Return null if presetKind is not provided or no presets
    if (presetKind === undefined || !presets || presets.length === 0)
      return null;

    try {
      // Parse all presets data
      const parsedPresets = presets
        .map((preset: any) => {
          try {
            const parsedData = JSON.parse(preset.data);
            return {
              ...preset,
              parsedData,
            };
          } catch (err) {
            console.error("Error parsing preset data:", err);
            return null;
          }
        })
        .filter(Boolean)
        .filter((preset: any) => preset?.parsedData?.lastUpdated > 0);

      if (parsedPresets.length === 0) return null;

      // Sort by lastUpdated (descending)
      parsedPresets.sort(
        (a: any, b: any) => b.parsedData.lastUpdated - a.parsedData.lastUpdated
      );

      // Return the most recent one
      const mostRecent = parsedPresets[0];
      return {
        ...mostRecent,
        data: mostRecent.parsedData,
      };
    } catch (err) {
      console.error("Error determining default preset:", err);
      return null;
    }
  }, [presets, presetKind]);

  // Function to get presets (manual trigger if needed)
  const getPresets = useCallback(async () => {
    if (presetKind === undefined) {
      console.warn("Cannot get presets: presetKind is not provided");
      return [];
    }

    try {
      const updatedPresets = await revalidatePresets();
      return updatedPresets;
    } catch (err) {
      console.error("Failed to fetch presets:", err);
      throw err;
    }
  }, [revalidatePresets, presetKind]);

  // Function to add a preset
  const addPreset = useCallback(
    async ({ name, data }: any) => {
      if (presetKind === undefined) {
        console.warn("Cannot add preset: presetKind is not provided");
        throw new Error("PresetKind is required to add presets");
      }

      try {
        const stringifiedData = JSON.stringify(data);
        const newPreset = await addPresetFn({
          presetKind,
          name,
          data: stringifiedData,
        });

        // Update the cache without triggering a rerender or revalidation
        await revalidatePresets(
          (currentData: any) => {
            return currentData ? [...currentData, newPreset] : [newPreset];
          },
          {
            revalidate: false, // Don't revalidate with the server
            populateCache: true, // Update the cache
            optimisticData: (currentData: any) =>
              currentData ? [...currentData, newPreset] : [newPreset],
          }
        );

        return newPreset;
      } catch (err) {
        console.error("Failed to add preset:", err);
        throw err;
      }
    },
    [presetKind, revalidatePresets]
  );

  // Function to delete a preset
  const deletePreset = useCallback(
    async (presetId: any) => {
      if (presetKind === undefined) {
        console.warn("Cannot delete preset: presetKind is not provided");
        throw new Error("PresetKind is required to delete presets");
      }

      try {
        await agent.deletePreset({ presetId: String(presetId) });

        // Update the cache without triggering a rerender or revalidation
        await revalidatePresets(
          (currentPresets: any) => {
            return (
              currentPresets?.filter(
                (preset: any) => preset.presetId !== presetId
              ) || []
            );
          },
          {
            revalidate: false, // Don't revalidate with the server
            populateCache: true, // Update the cache
            optimisticData: (currentPresets: any) =>
              currentPresets?.filter(
                (preset: any) => preset.presetId !== presetId
              ) || [],
          }
        );
      } catch (err) {
        console.error("Failed to delete preset:", err);
        throw err;
      }
    },
    [revalidatePresets, presetKind]
  );

  //   // Return consistent interface regardless of whether presetKind is provided
  return {
    presets: presetKind !== undefined ? presets : [],
    defaultPreset: presetKind !== undefined ? defaultPreset : null,
    isLoading: presetKind !== undefined ? isValidating || isLoading : false,
    error: presetKind !== undefined ? error : null,
    getPresets,
    //   addPreset,
    //   deletePreset,
    // Add a helper to check if presets are enabled
    presetsEnabled: presetKind !== undefined,
  };
};
