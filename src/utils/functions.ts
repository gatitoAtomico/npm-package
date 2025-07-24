import isNil from "lodash/isNil";
import isEmpty from "lodash/isEmpty";
import isPlainObject from "lodash/isPlainObject";
import transform from "lodash/transform";
import isString from "lodash/isString";

/**
 * Removes all keys that have either `null`, `undefined`, or empty string values from an object recursively.
 *
 * @param obj - The object to prune.
 * @returns A new object with `null`, `undefined`, and empty string values removed.
 */
export const pruneNullOrUndefinedFields = <T extends Record<string, any>>(
  obj: T
): Partial<T> => {
  function recursiveTransform(
    result: Record<string, any>,
    value: any,
    key: string
  ) {
    // Handle nested objects
    if (isPlainObject(value)) {
      const objRes = transform(value, recursiveTransform, {});
      if (!isEmpty(objRes)) {
        result[key] = objRes;
      }
      return result;
    }

    // Skip null, undefined, and empty strings
    if (isNil(value) || (isString(value) && value === "")) {
      return result;
    }

    // Keep all other values
    result[key] = value;
    return result;
  }

  return transform(obj, recursiveTransform, {}) as Partial<T>;
};

export const createNullFilters = (obj: any): any => {
  return Object.keys(obj).reduce(
    (acc: any, key: string) => ({
      ...acc,
      [key]:
        obj[key] && Array.isArray(obj[key])
          ? null // Return empty array for array fields
          : obj[key] && typeof obj[key] === "object"
          ? createNullFilters(obj[key])
          : null,
    }),
    {}
  );
};
