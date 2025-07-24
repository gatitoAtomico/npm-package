import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { Card, Form, Flex, FormInstance } from "antd";

import CustomCollapse from "components/kyp/CustomCollapse";
import DraggableTable from "components/kyp/DraggableTable";
import TableOptions from "components/kyp/TableOptions";
import TablePresets from "components/kyp/TablePresets";
import PageHeaderComp from "components/layouts/page/header";
import TableFormButtons from "components/kyp/TableFormButtons";
import { TableQueryOptions, useTableQuery } from "../../hooks/useTableQuery";
import { createNullFilters } from "../../utils/functions";
import { usePresets } from "../../hooks/usePresets";

/**
 * Form section configuration
 */
export interface FormSection {
  title: string;
  getFilledCount?: () => number;
  content: React.ReactNode;
}

/**
 * Context passed to render functions
 */
export interface RenderContext {
  dataSource: any[];
  columns: any[];
  originalData: any;
  selectedRows: any[];
  revalidate: () => Promise<void> | void;
  handleReset: () => Promise<void> | void;
  isLoading: boolean;
  pagination: any;
  handleTableChange: any;
  tableRowSelection: any;
  onRowClick?: (record: any) => {
    onDoubleClick?: () => void;
    onClick?: () => void;
  };
  submittedFilters: any;
  exportFn: () => Promise<any>;
}

/**
 * Enhanced TableQueryOptions with dynamic columns support
 */
export interface EnhancedTableQueryOptions<T>
  extends Omit<TableQueryOptions<T>, "columns"> {
  columns?: any[] | ((context: RenderContext) => any[]);
}

/**
 * Props for the PageBuilder component
 */
export interface PageBuilderProps {
  title: string;
  resultsTitleRender?: (context: RenderContext) => string;
  presetKind?: number; // Made optional
  getPresetsFn?: (params: { presetKind: number }) => Promise<any[]>;
  tableQueryOptions: EnhancedTableQueryOptions<any>;
  formSections: FormSection[];
  onRowClick?: (record: any) => {
    onDoubleClick?: () => void;
    onClick?: () => void;
  };
  form: FormInstance;
  onSubmit?: (formValues: any, submitFilters: (values: any) => void) => void;
  onClear?: ({ nullValues }: { nullValues?: any }) => void;
  onReset?: () => Promise<void> | void;
  rowSelection?: {
    type: "radio" | "checkbox";
    onChange?: (
      selectedRowKeys: React.Key[],
      selectedRows: any[],
      info: { type: "all" | "none" }
    ) => void;
    getCheckboxProps?: (record: any) => object;
    selectedRowKeys?: React.Key[];
  };

  /**
   * Custom render function that completely replaces the Results section.
   * @warning When this prop is provided, `tableActionsRender` will be ignored.
   */
  render?: (context: RenderContext) => React.ReactNode;

  /**
   * Renders additional actions/controls above the default table.
   * @warning This prop has no effect when `render` prop is provided.
   */
  tableActionsRender?: (context: RenderContext) => React.ReactNode;
}

const PageBuilder: React.FC<PageBuilderProps> = ({
  title,
  resultsTitleRender,
  presetKind,
  tableQueryOptions,
  formSections,
  onRowClick,
  form,
  onSubmit,
  onClear,
  rowSelection,
  render,
  tableActionsRender,
  onReset,
  getPresetsFn = null,
}) => {
  // Track if we've loaded initial data
  const [isInitialized, setIsInitialized] = useState(false);
  const initialLoadDoneRef = useRef(false);

  // Row selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>(
    rowSelection?.selectedRowKeys || []
  );
  const [selectedRows, setSelectedRows] = useState<any[]>([]);

  Form.useWatch([], form);

  // Get presets
  const {
    presets,
    defaultPreset,
    isLoading: isPresetsLoading,
    addPreset,
    deletePreset,
    getPresets,
    presetsEnabled,
  } = usePresets(presetKind, getPresetsFn);

  const {
    fetchData: originalFetchData,
    initialFilters = {},
    cacheKey,
  } = tableQueryOptions;

  // Configure the data fetching function
  const fetchData = useCallback(
    async (params: any) => {
      if (!isInitialized) {
        // Don't fetch data until we're initialized
        return { mainResult: [], mainResultCount: 0 };
      }
      return originalFetchData(params);
    },
    [originalFetchData, isInitialized]
  );

  // Generate initial columns to pass to useTableQuery
  const initialColumns = useMemo(() => {
    const { columns: columnsConfig } = tableQueryOptions;

    if (typeof columnsConfig === "function") {
      // For dynamic columns, create a minimal context for initial generation
      const tempRenderContext: RenderContext = {
        dataSource: [],
        originalData: null,
        selectedRows: [],
        revalidate: () => {},
        handleReset: () => {},
        isLoading: true,
        pagination: {},
        handleTableChange: () => {},
        tableRowSelection: undefined,
        onRowClick,
        submittedFilters: {},
        exportFn: async () => {},
        columns: [], // Will be populated after this function returns
      };
      return columnsConfig(tempRenderContext);
    }

    return columnsConfig || [];
  }, [tableQueryOptions, onRowClick]);

  // Set up table query with initial columns
  const {
    dataSource,
    columns: managedColumns,
    isFetching,
    pagination,
    updateColumnVisibility,
    resetColumnVisibility,
    submitFilters,
    handleTableChange,
    clearCache,
    revalidate,
    originalData,
    submittedFilters,
    exportFn,
    error,
  } = useTableQuery({
    ...tableQueryOptions,
    columns: initialColumns, // Pass initial columns to useTableQuery
    fetchData,
    initialFilters,
    cacheKey: isInitialized ? cacheKey : undefined,
  });

  // Handle initial preset loading - only run once when defaultPreset is loaded
  useEffect(() => {
    // Skip if we've already done initial load
    if (initialLoadDoneRef.current) {
      return;
    }

    // If presetKind is not provided, skip preset loading and initialize immediately
    if (!presetsEnabled) {
      initialLoadDoneRef.current = true;
      form.resetFields();
      form.setFieldsValue(initialFilters);
      submitFilters(initialFilters);
      setIsInitialized(true);
      return;
    }

    // Skip if presets are still loading or we don't have presets data yet
    if (isPresetsLoading || presets === undefined) {
      return;
    }

    // Mark that we've done the initial load
    initialLoadDoneRef.current = true;

    // Determine which filters to use
    const filtersToUse = defaultPreset?.data?.filters || initialFilters;

    // Set form values with all nested structures
    form.setFieldsValue(createNullFilters(initialFilters));
    form.setFieldsValue(filtersToUse);

    // Submit these filters to the query
    submitFilters(filtersToUse);

    // Mark that we're initialized and can fetch data
    setIsInitialized(true);
  }, [
    defaultPreset,
    presets,
    isPresetsLoading,
    form,
    initialFilters,
    submitFilters,
    presetsEnabled,
  ]);

  // Update local state when rowSelection.selectedRowKeys changes from outside
  useEffect(() => {
    if (rowSelection?.selectedRowKeys) {
      setSelectedRowKeys(rowSelection.selectedRowKeys);
    }
  }, [rowSelection?.selectedRowKeys]);

  // Apply a preset (used by the TablePresets component)
  const applyPreset = useCallback(
    (preset: any) => {
      if (!preset?.filters) return;

      form.setFieldsValue(createNullFilters(initialFilters));

      // Apply the filters to the form
      form.setFieldsValue(preset.filters);

      // Submit these filters to trigger a fetch
      submitFilters(preset.filters);
    },
    [form, submitFilters, initialFilters]
  );

  // Handle form submission
  const handleFormSubmit = () => {
    const formValues = form.getFieldsValue();

    if (onSubmit) {
      // Call the provided onSubmit function and pass submitFilters as a parameter
      onSubmit(formValues, submitFilters);
    } else {
      // Default behavior if no onSubmit is provided
      submitFilters(formValues);
    }
  };

  const handleReset = async () => {
    // Clear all related cache before submitting filters
    await clearCache();

    await Promise.all([onReset && onReset(), revalidate()]);

    setSelectedRowKeys([]);
    setSelectedRows([]);
  };

  // Create row selection config for the table
  const tableRowSelection = rowSelection
    ? {
        type: rowSelection.type,
        selectedRowKeys,
        onChange: (newSelectedRowKeys: React.Key[], newSelectedRows: any[]) => {
          // Update the local state
          setSelectedRowKeys(newSelectedRowKeys);
          setSelectedRows(newSelectedRows);

          // Call the external onChange handler if provided
          if (rowSelection.onChange) {
            rowSelection.onChange(newSelectedRowKeys, newSelectedRows, {
              type: newSelectedRowKeys?.length ? "all" : "none",
            });
          }
        },
        getCheckboxProps: rowSelection.getCheckboxProps,
      }
    : undefined;

  useEffect(() => {
    //only clear selections if rowSelection is defined and dataSource has more than 1 item for example it will trigger on deposits page
    if (dataSource?.length > 1 && rowSelection) {
      setSelectedRowKeys([]);
      setSelectedRows([]);
    }
  }, [dataSource]);

  // Combined loading state (don't include preset loading if presets are disabled)
  const isLoading =
    isFetching || (presetsEnabled && isPresetsLoading) || !isInitialized;

  // Generate final columns for render context if function-based
  const finalColumns = useMemo(() => {
    const { columns: columnsConfig } = tableQueryOptions;

    if (typeof columnsConfig === "function") {
      // Create render context for dynamic column generation
      const tempRenderContext: RenderContext = {
        dataSource,
        originalData,
        selectedRows,
        revalidate,
        handleReset,
        isLoading,
        pagination,
        handleTableChange,
        tableRowSelection,
        onRowClick,
        submittedFilters,
        exportFn,
        columns: managedColumns, // Use managed columns from useTableQuery
      };

      // Generate new columns with current context
      const newColumns = columnsConfig(tempRenderContext);

      // Apply visibility state from managed columns to new columns
      return newColumns.map((newCol) => {
        const managedCol = managedColumns.find(
          (mc) => mc.key === newCol.key || mc.dataIndex === newCol.dataIndex
        );
        if (managedCol) {
          return {
            ...newCol,
            hidden: managedCol.hidden,
          };
        }
        return newCol;
      });
    }

    // For static columns, use the managed columns directly
    return managedColumns;
  }, [
    tableQueryOptions,
    dataSource,
    originalData,
    selectedRows,
    revalidate,
    handleReset,
    isLoading,
    pagination,
    handleTableChange,
    tableRowSelection,
    onRowClick,
    submittedFilters,
    exportFn,
    managedColumns,
  ]);

  // Create render context with final columns
  const renderContext: RenderContext = {
    dataSource,
    originalData,
    selectedRows,
    revalidate,
    handleReset,
    isLoading,
    pagination,
    handleTableChange,
    tableRowSelection,
    onRowClick,
    submittedFilters,
    exportFn,
    columns: finalColumns,
  };

  // Prepare accordion items with filled field counts
  const items = formSections.map((section) => ({
    title: section.title,
    content: section.content,
    // Use the provided getFilledCount function if available
    filledCount: section.getFilledCount ? section.getFilledCount() : 0,
  }));

  return (
    <div className="p-4">
      <div className="px-2 pb-3">
        <PageHeaderComp title={title} />
      </div>

      <Form
        form={form}
        initialValues={initialFilters}
        onFinish={handleFormSubmit}
      >
        <CustomCollapse defaultActiveKey={[1]} items={items} />

        <Flex
          justify="space-between"
          align="center"
          style={{ padding: "16px" }}
        >
          <TableFormButtons handleReset={handleReset} isLoading={isLoading} />

          {/* Conditionally render TablePresets only if presets are enabled */}
          {presetsEnabled && (
            <TablePresets
              applyPreset={applyPreset}
              isLoading={isLoading}
              addPreset={addPreset}
              deletePreset={deletePreset}
              getPresets={getPresets}
              presets={presets}
              form={form}
              handleClear={() => {
                const nullFilters = createNullFilters(form.getFieldsValue());
                form.setFieldsValue(nullFilters);
                onClear && onClear({ nullValues: nullFilters });
              }}
            />
          )}
        </Flex>
      </Form>

      {/* Results section - can be completely customized or use default table */}
      {render ? (
        // Custom render function provided - use it instead of default table
        render(renderContext)
      ) : (
        // Default table rendering
        <Card
          title={
            (resultsTitleRender && resultsTitleRender(renderContext)) ||
            "Results"
          }
        >
          <TableOptions
            filters={submittedFilters}
            exportFn={exportFn}
            columns={finalColumns}
            dataSource={dataSource}
            className="mb-4"
            updateColumnVisibility={updateColumnVisibility}
            resetColumnVisibility={resetColumnVisibility}
          />
          {/* Table actions - Export, bulk operations, etc. */}
          {tableActionsRender && tableActionsRender(renderContext)}
          <DraggableTable
            name={`${title.toLowerCase().replace(/\s+/g, "-")}`}
            columns={finalColumns}
            dataSource={dataSource}
            loading={isLoading}
            pagination={pagination}
            onRow={onRowClick}
            onChange={handleTableChange}
            rowSelection={tableRowSelection}
          />
        </Card>
      )}
    </div>
  );
};

export default PageBuilder;
