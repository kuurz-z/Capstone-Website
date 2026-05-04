// Currency formatting utilities
export const formatCurrency = (amount, currency = "PHP") => {
  if (amount === null || amount === undefined) return "";

  const formattedAmount = Number(amount).toLocaleString("en-PH", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formattedAmount;
};

export const parseCurrency = (currencyString) => {
  if (!currencyString) return 0;

  // Remove currency symbols and commas
  const cleanString = currencyString.replace(/[^\d.-]/g, "");
  return parseFloat(cleanString);
};
