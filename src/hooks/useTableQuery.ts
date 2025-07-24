import React, { useState, useEffect, useCallback } from "react";
import useSWR, { mutate } from "swr";
import useNotif from "./useNotif";
import { ColumnType, TablePaginationConfig } from "antd/es/table";
import { FormInstance } from "antd";
import { pruneNullOrUndefinedFields } from "../utils/functions";
import useDebouncedCallback from "./useDebounce";
import { parseErrorMessage } from "../utils/helpers/errorMessageHelper";

export interface FetchDataParams {
  filters: Record<string, any>;
  pagination?: {
    page: number;
    pageSize: number;
  };
  sorter?: {
    orderColumn?: string;
    orderDir?: number; // 1 for ascending, -1 for descending
  };
}

type CustomColumnType<T> = ColumnType<T> & {
  formRender?: (
    text: any,
    record: T,
    index: number,
    form: FormInstance
  ) => React.ReactNode;
};

export interface TableQueryOptions<T> {
  fetchData: (params: FetchDataParams) => Promise<any>;
  initialData?: any;
  columns?: CustomColumnType<T>[]; // Made optional since PageBuilder will handle columns
  initialFilters?: Record<string, any>;
  cacheKey: string | undefined | null;
  initialPage?: number;
  initialPageSize?: number;
  initialSorter?: Record<string, any>;
  paginationConfig?: TablePaginationConfig;
  staleTime?: number;
  onSuccess?: (data: any) => void;
  onError?: (data: any) => void;
}

function getTimeWindowKey(intervalMinutes = 5, prefix = "") {
  const now = new Date();
  // Calculate how many intervals have passed since epoch
  const intervalMs = intervalMinutes * 60 * 1000; //this is for 5 minutes
  const intervals = Math.floor(now.getTime() / intervalMs);

  // Return a key combining the prefix and interval number
  return `${prefix}${intervals}`;
}

// Utility function to extract data from various response structures
function extractDataFromResponse<T>(data: any): T[] {
  return (data?.response?.mainResult ??
    data?.response ??
    data?.mainResult ??
    data?.MainResult ??
    data?.body?.mainResult ??
    data?.body?.data ??
    data?.body ??
    data?.data ??
    data?.Data ??
    []) as T[];
}

export function useTableQuery<T extends object>({
  fetchData,
  initialData = {},
  columns: initialColumns = [], // Default to empty array
  initialFilters = {},
  cacheKey,
  initialPage = 1,
  initialPageSize = 10,
  initialSorter = {},
  paginationConfig,
  staleTime: defaultStale,
  onSuccess,
  onError,
}: TableQueryOptions<T>) {
  // Add order information to initial columns if not present and columns exist
  const columnsWithOrder =
    initialColumns.length > 0
      ? initialColumns.map((col: any, index) => ({
          ...col,
          order: col.order !== undefined ? col.order : index,
        }))
      : [];

  const [isCacheKeyUndefined, setIsCacheKeyUndefined] = useState(false);
  const [columns, setColumns] = useState<ColumnType<T>[]>(columnsWithOrder);
  const [current, setCurrent] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [submittedFilters, setSubmittedFilters] = useState<any>(
    pruneNullOrUndefinedFields(initialFilters)
  );
  const [sorter, setSorter] = useState(initialSorter);
  const [staleTime, setStaleTime] = useState(
    getTimeWindowKey(defaultStale, "filters_")
  );
  // Add state to track retry attempts
  const [isRetrying, setIsRetrying] = useState(false);

  const openNotif = useNotif();

  const debouncedOpenNotif = useDebouncedCallback(
    (
      type: "error" | "success" | "info" | "warning",
      config: { message: string; description: string }
    ) => {
      openNotif(type, config);
    },
    500
  );

  const defaultPaginationConfig: TablePaginationConfig = {
    position: ["bottomLeft"],
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number, range: [number, number]) =>
      `${range[0]}-${range[1]} of ${total} items`,
  };

  const mergedPaginationConfig = {
    ...defaultPaginationConfig,
    ...paginationConfig,
  };

  // Sort columns based on their order property
  const sortedColumns = useCallback(() => {
    return [...columns].sort((a: any, b: any) => {
      const orderA = a.order !== undefined ? a.order : 999;
      const orderB = b.order !== undefined ? b.order : 999;
      return orderA - orderB;
    });
  }, [columns]);

  // Function to submit new filters and trigger a fetch
  const submitFilters = useCallback((newFilters: Record<string, any>) => {
    const processedFilters = pruneNullOrUndefinedFields(newFilters);
    setSubmittedFilters(processedFilters);
    setCurrent(1); // Reset to first page when filters change
    setStaleTime(getTimeWindowKey(defaultStale, "filters_"));
    setIsCacheKeyUndefined(false);
    setIsRetrying(false); // Reset retry state when submitting new filters
  }, []);

  // Create export function that always uses pageSize: 0 and returns unified data structure
  const exportFn: () => Promise<T[]> = async () => {
    const rawData = await fetchData({
      filters: submittedFilters,
      pagination: {
        page: 1,
        pageSize: 0,
      },
      sorter: {
        orderColumn: sorter.columnKey || sorter.field,
        orderDir: sorter.order ? (sorter.order === "ascend" ? 1 : -1) : -1,
      },
    });

    // Return the same unified data structure as dataSource
    return extractDataFromResponse<T>(rawData);
  };

  // SWR fetch with submitted filters
  const {
    data,
    error,
    isValidating: isFetching,
    isLoading,
    mutate: revalidate,
  } = useSWR(
    isCacheKeyUndefined
      ? undefined
      : [
          cacheKey,
          current,
          pageSize,
          JSON.stringify(submittedFilters),
          JSON.stringify(sorter),
          staleTime,
        ],
    () => {
      return fetchData({
        filters: submittedFilters,
        pagination: {
          page: current,
          pageSize,
        },
        sorter: {
          orderColumn: sorter.columnKey || sorter.field,
          orderDir: sorter.order ? (sorter.order === "ascend" ? 1 : -1) : -1,
        },
      });
    },
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      onErrorRetry: async (error, key, config, revalidate, { retryCount }) => {
        setIsRetrying(true);

        if (retryCount >= 2) {
          //Retry failed, clearing cache and resetting filters
          await clearAllRelatedCache();
          setIsCacheKeyUndefined(true);
          setIsRetrying(false);
          return;
        }
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
      onSuccess: (data) => {
        setIsRetrying(false); // Reset retry state on success
        // Call the user-provided onSuccess callback if it exists
        if (onSuccess && typeof onSuccess === "function") {
          onSuccess(data);
        }
      },
      onError: async (err) => {
        console.error("Error fetching data:", err);

        const errorMessage = parseErrorMessage(err);

        debouncedOpenNotif("error", {
          message: "Error",
          description: errorMessage,
        });

        if (onError && typeof onError === "function") {
          onError(err);
        }
      },
    }
  );

  // Update column visibility and order
  const clearAllRelatedCache = async () => {
    // Clear all caches matching the prefix
    return mutate(
      (key) => {
        if (!cacheKey) return false; // Skip if no cacheKey

        // For string keys
        if (typeof key === "string") {
          return key.startsWith(cacheKey as string);
        }
        // For array keys
        if (Array.isArray(key) && typeof key[0] === "string") {
          return key[0].includes(cacheKey as string);
        }
        return false;
      },
      undefined, // Set to undefined to clear the cache
      { revalidate: false } // Don't revalidate immediately
    );
  };

  const updateColumnVisibility = useCallback(
    (key: string, hidden: boolean, order?: number) => {
      setColumns((prevColumns) => {
        const updatedColumns = prevColumns.map((col: any) => {
          if (col.dataIndex === key) {
            // If order is provided, update both visibility and order
            if (order !== undefined) {
              return { ...col, hidden, order };
            }
            // Otherwise just update visibility
            return { ...col, hidden };
          }
          return col;
        });
        return updatedColumns;
      });
    },
    []
  );

  // Reset columns to initial state
  const resetColumnVisibility = useCallback(() => {
    setColumns(columnsWithOrder);
  }, [columnsWithOrder]);

  // Handle pagination changes
  const handlePaginationChange = useCallback((page: number, size: number) => {
    setCurrent(page);
    setPageSize(size);
  }, []);

  const handleTableChange = useCallback(
    (pagination: any, filters: any, sorter: any) => {
      // Handle pagination changes
      setCurrent(pagination.current);
      setPageSize(pagination.pageSize);

      // Handle sorter changes (could be an object or array if multiple columns)
      if (sorter) {
        // If it's multi-sort, just use the first sort column for now
        const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
        if (activeSorter.order) {
          setSorter(activeSorter);
        } else {
          // No sorting applied
          setSorter({});
        }
      }
    },
    []
  );

  return {
    dataSource: extractDataFromResponse<T>(data ?? initialData),
    originalData: data ?? initialData,
    columns: sortedColumns() as ColumnType<T>[],
    isFetching: isFetching || isLoading || isRetrying, // Include retry state
    error,
    submittedFilters,
    submitFilters,
    exportFn, // Now uses the custom export function with pageSize: 0
    clearCache: clearAllRelatedCache,
    revalidate,
    pagination: {
      ...mergedPaginationConfig,
      current,
      pageSize,
      onChange: handlePaginationChange,
      total:
        data?.mainResultCount ??
        data?.MainResultCount ??
        data?.body?.mainResultCount ??
        data?.response?.mainResultCount ??
        data?.total_rows ??
        data?.totalCount ??
        0,
    },
    sorter,
    handleTableChange,
    updateColumnVisibility,
    resetColumnVisibility,
  };
}
