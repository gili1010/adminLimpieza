"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CartItem, Client, Product, Sale, SaleItem } from "@/lib/types";

type View = "dashboard" | "ventas" | "productos" | "clientes";
type Range = "day" | "week" | "month" | "custom";

const getPresetRangeDates = (selectedRange: Exclude<Range, "custom">) => {
  const now = new Date();
  const startDate =
    selectedRange === "day"
      ? now
      : selectedRange === "week"
        ? startOfWeek(now, { weekStartsOn: 1 })
        : startOfMonth(now);

  return {
    start: format(startDate, "yyyy-MM-dd"),
    end: format(now, "yyyy-MM-dd"),
  };
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);

export default function Home() {
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(Boolean(supabase));
  const [pageLoading, setPageLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [range, setRange] = useState<Range>("day");
  const [dashboardStartDate, setDashboardStartDate] = useState(() => getPresetRangeDates("day").start);
  const [dashboardEndDate, setDashboardEndDate] = useState(() => getPresetRangeDates("day").end);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  const [productName, setProductName] = useState("");
  const [productCost, setProductCost] = useState("");
  const [productSalePrice, setProductSalePrice] = useState("");
  const [productStock, setProductStock] = useState("");
  const [productStockMin, setProductStockMin] = useState("0");
  const [productListSearch, setProductListSearch] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const [selectedSalePrice, setSelectedSalePrice] = useState("");
  const [saleClientId, setSaleClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [historyStartDate, setHistoryStartDate] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [historyEndDate, setHistoryEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [expandedSaleIds, setExpandedSaleIds] = useState<string[]>([]);

  useEffect(() => {
    const selectedProduct = products.find((product) => product.id === selectedProductId);
    if (!selectedProduct) {
      setSelectedSalePrice("");
      return;
    }

    const quantity = Number(selectedQuantity) || 1;
    setSelectedSalePrice(String(Number(selectedProduct.sale_price) * quantity));
  }, [products, selectedProductId, selectedQuantity]);

  useEffect(() => {
    if (!selectedProductId) setProductSearch("");
  }, [selectedProductId]);

  const filteredActiveProducts = useMemo(() => {
    const active = products.filter((p) => p.is_active);
    const sorted = active.sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (!productSearch) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [products, productSearch]);

  const filteredProductsList = useMemo(() => {
    const normalizedSearch = productListSearch.trim().toLowerCase();
    const sorted = [...products].sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );

    if (!normalizedSearch) return sorted;
    return sorted.filter((product) => product.name.toLowerCase().includes(normalizedSearch));
  }, [products, productListSearch]);

  const selectedUnitSalePrice = useMemo(() => {
    const quantity = Number(selectedQuantity);
    const totalSalePrice = Number(selectedSalePrice);

    if (Number.isNaN(quantity) || quantity <= 0) return null;
    if (Number.isNaN(totalSalePrice) || totalSalePrice < 0) return null;

    return totalSalePrice / quantity;
  }, [selectedQuantity, selectedSalePrice]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );

  const saleItemsBySaleId = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    saleItems.forEach((item) => {
      const existing = map.get(item.sale_id) ?? [];
      existing.push(item);
      map.set(item.sale_id, existing);
    });
    return map;
  }, [saleItems]);

  const editingSaleBaseQuantities = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingSaleId) return map;

    (saleItemsBySaleId.get(editingSaleId) ?? []).forEach((item) => {
      map.set(item.product_id, (map.get(item.product_id) ?? 0) + Number(item.quantity));
    });

    return map;
  }, [editingSaleId, saleItemsBySaleId]);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return;
    setPageLoading(true);
    setError(null);

    const [productsQuery, clientsQuery, salesQuery] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("*")
        .eq("owner_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("sales")
        .select("*")
        .eq("owner_id", userId)
        .order("sold_at", { ascending: false })
        .limit(400),
    ]);

    if (productsQuery.error) {
      setError(productsQuery.error.message);
    } else {
      setProducts(productsQuery.data as Product[]);
    }

    if (clientsQuery.error) {
      if (clientsQuery.error.message.includes("Could not find the table 'public.clients'")) {
        setClients([]);
        setError(
          "Falta aplicar la migración de clientes en Supabase. Ejecutá el schema.sql actualizado y refrescá."
        );
      } else {
        setError(clientsQuery.error.message);
      }
    } else {
      setClients(clientsQuery.data as Client[]);
    }

    if (salesQuery.error) {
      setError(salesQuery.error.message);
    } else {
      const nextSales = salesQuery.data as Sale[];
      setSales(nextSales);

      if (nextSales.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("sale_items")
          .select("*")
          .in(
            "sale_id",
            nextSales.map((sale) => sale.id)
          )
          .order("created_at", { ascending: true });

        if (itemsError) {
          setError(itemsError.message);
        } else {
          setSaleItems(itemsData as SaleItem[]);
        }
      } else {
        setSaleItems([]);
      }
    }

    setPageLoading(false);
  }, [supabase]);

  // Effect 1: solo gestiona la sesión y el estado de boot.
  // Sin async, sin loadData — evita condiciones de carrera con Strict Mode.
  useEffect(() => {
    if (!supabase) {
      return;
    }

    const fallbackTimer = setTimeout(() => setBootLoading(false), 6000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      setSession(authSession ?? null);
      if (event === "INITIAL_SESSION") {
        clearTimeout(fallbackTimer);
        setBootLoading(false);
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Effect 2: carga o limpia datos cuando cambia el usuario autenticado.
  // Usa session.user.id como dep para no re-ejecutar en TOKEN_REFRESHED.
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (bootLoading) return;
    if (sessionUserId) {
      loadData(sessionUserId);
    } else {
      setProducts([]);
      setClients([]);
      setSales([]);
      setSaleItems([]);
      setCart([]);
    }
  }, [sessionUserId, bootLoading, loadData]);

  const signInOrRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setError(null);

    if (isRegister) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Usuario creado. Si tenés confirmación por email, revisá tu inbox.");
      }
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const addProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) return;

    const cost = Number(productCost);
    const price = Number(productSalePrice);
    const stock = Number(productStock);
    const stockMin = Number(productStockMin);

    if (
      !productName.trim() ||
      Number.isNaN(cost) ||
      Number.isNaN(price) ||
      Number.isNaN(stock) ||
      Number.isNaN(stockMin)
    ) {
      setError("Completá nombre, costo, precio de venta, stock y stock mínimo válidos.");
      return;
    }

    const { error: insertError } = await supabase.from("products").insert({
      owner_id: session.user.id,
      name: productName.trim(),
      cost_price: cost,
      sale_price: price,
      stock,
      stock_min: stockMin,
      is_active: true,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setProductName("");
    setProductCost("");
    setProductSalePrice("");
    setProductStock("");
    setProductStockMin("0");
    await loadData(session.user.id);
  };

  const toggleProductActive = async (product: Product) => {
    if (!supabase || !session) return;

    const { error: updateError } = await supabase
      .from("products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id)
      .eq("owner_id", session.user.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData(session.user.id);
  };

  const quickEditProduct = async (product: Product) => {
    if (!supabase || !session) return;

    const name = window.prompt("Nombre", product.name) ?? product.name;
    const cost = Number(window.prompt("Costo", String(product.cost_price)) ?? product.cost_price);
    const sale = Number(
      window.prompt("Precio de venta", String(product.sale_price)) ?? product.sale_price
    );
    const stock = Number(window.prompt("Stock", String(product.stock)) ?? product.stock);
    const stockMin = Number(window.prompt("Stock mínimo", String(product.stock_min)) ?? product.stock_min);

    if (
      !name.trim() ||
      Number.isNaN(cost) ||
      Number.isNaN(sale) ||
      Number.isNaN(stock) ||
      Number.isNaN(stockMin)
    ) {
      setError("Edición cancelada: valores inválidos.");
      return;
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ name: name.trim(), cost_price: cost, sale_price: sale, stock, stock_min: stockMin })
      .eq("id", product.id)
      .eq("owner_id", session.user.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData(session.user.id);
  };

  const addItemToCart = () => {
    const selectedProduct = products.find((product) => product.id === selectedProductId);
    const quantity = Number(selectedQuantity);
    const totalSalePrice = Number(selectedSalePrice);

    if (!selectedProduct) {
      setError("Elegí un producto.");
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (Number.isNaN(totalSalePrice) || totalSalePrice <= 0) {
      setError("Ingresá un precio total válido.");
      return;
    }

    const unitSalePrice = totalSalePrice / quantity;

    const reservedStock = cart
      .filter((item) => item.product_id === selectedProduct.id)
      .reduce((accumulator, item) => accumulator + item.quantity, 0);
    const editingStockCredit = editingSaleBaseQuantities.get(selectedProduct.id) ?? 0;
    const availableStock = Number(selectedProduct.stock) + editingStockCredit - reservedStock;

    if (quantity > availableStock) {
      setError("No hay stock suficiente para ese producto.");
      return;
    }

    setCart((previous) => {
      const existing = previous.find(
        (item) =>
          item.product_id === selectedProduct.id &&
          Number(item.unit_sale_price) === unitSalePrice &&
          Number(item.unit_cost_price) === Number(selectedProduct.cost_price)
      );

      if (existing) {
        return previous.map((item) =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [
        ...previous,
        {
          id: `${selectedProduct.id}-${unitSalePrice}-${Date.now()}`,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity,
          unit_sale_price: unitSalePrice,
          unit_cost_price: Number(selectedProduct.cost_price),
        },
      ];
    });

    setSelectedQuantity("1");
    setSelectedProductId("");
    setError(null);
  };

  const removeCartItem = (cartItemId: string) => {
    setCart((previous) => previous.filter((item) => item.id !== cartItemId));
  };

  const toggleSaleExpanded = (saleId: string) => {
    setExpandedSaleIds((previous) =>
      previous.includes(saleId)
        ? previous.filter((currentId) => currentId !== saleId)
        : [...previous, saleId]
    );
  };

  const resolveClientId = useCallback(async () => {
    if (!supabase || !session) return saleClientId || null;

    const trimmedName = newClientName.trim();
    if (!trimmedName) {
      return saleClientId || null;
    }

    const existingClient = clients.find(
      (client) => client.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingClient) {
      return existingClient.id;
    }

    const { data, error: clientInsertError } = await supabase
      .from("clients")
      .insert({
        owner_id: session.user.id,
        name: trimmedName,
      })
      .select("id")
      .single();

    if (clientInsertError || !data) {
      setError(clientInsertError?.message ?? "No se pudo crear el cliente.");
      return null;
    }

    return data.id;
  }, [clients, newClientName, saleClientId, session, supabase]);

  const resetSaleEditor = () => {
    setCart([]);
    setSaleNote("");
    setSelectedProductId("");
    setSelectedQuantity("1");
    setSelectedSalePrice("");
    setSaleClientId("");
    setNewClientName("");
    setEditingSaleId(null);
  };

  const startEditingSale = (sale: Sale) => {
    const items = saleItemsBySaleId.get(sale.id) ?? [];

    if (items.length === 0) {
      setError("La venta no tiene detalle para editar.");
      return;
    }

    if (
      cart.length > 0 &&
      !window.confirm("Ya hay productos en el carrito. ¿Querés reemplazarlos por la venta a editar?")
    ) {
      return;
    }

    setCart(
      items.map((item) => ({
        id: `${sale.id}-${item.id}`,
        product_id: item.product_id,
        product_name: productsById.get(item.product_id)?.name ?? "Producto",
        quantity: Number(item.quantity),
        unit_sale_price: Number(item.unit_sale_price),
        unit_cost_price: Number(item.unit_cost_price),
      }))
    );
    setSaleNote(sale.note ?? "");
    setSaleClientId(sale.client_id ?? "");
    setNewClientName("");
    setEditingSaleId(sale.id);
    setActiveView("ventas");
    setSelectedProductId("");
    setSelectedQuantity("1");
    setSelectedSalePrice("");
    setError(null);
  };

  const restoreStockAndDeleteSale = async (saleId: string) => {
    if (!supabase || !session) return false;

    const items = saleItemsBySaleId.get(saleId) ?? [];
    const productAdjustments = new Map<string, number>();

    items.forEach((item) => {
      productAdjustments.set(
        item.product_id,
        (productAdjustments.get(item.product_id) ?? 0) + Number(item.quantity)
      );
    });

    const stockUpdates = [...productAdjustments.entries()].map(([productId, quantity]) => {
      const product = productsById.get(productId);
      if (!product) return Promise.resolve({ error: null });

      return supabase
        .from("products")
        .update({ stock: Number(product.stock) + quantity })
        .eq("id", productId)
        .eq("owner_id", session.user.id);
    });

    const stockResults = await Promise.all(stockUpdates);
    const stockError = stockResults.find((result) => result.error)?.error;
    if (stockError) {
      setError(stockError.message);
      return false;
    }

    const { error: deleteError } = await supabase
      .from("sales")
      .delete()
      .eq("id", saleId)
      .eq("owner_id", session.user.id);

    if (deleteError) {
      setError(deleteError.message);
      return false;
    }

    return true;
  };

  const voidSale = async (saleId: string) => {
    if (!session || !supabase) return;

    if (!window.confirm("¿Seguro que querés anular esta venta? Se devolverá el stock.")) {
      return;
    }

    const success = await restoreStockAndDeleteSale(saleId);
    if (!success) return;

    if (editingSaleId === saleId) {
      resetSaleEditor();
    }

    await loadData(session.user.id);
  };

  const confirmSale = async () => {
    if (!supabase || !session) return;
    if (cart.length === 0) {
      setError("Agregá al menos un producto al carrito.");
      return;
    }

    const resolvedClientId = await resolveClientId();
    if (newClientName.trim() && !resolvedClientId) {
      return;
    }

    const totalAmount = cart.reduce(
      (accumulator, item) => accumulator + item.unit_sale_price * item.quantity,
      0
    );
    const totalCost = cart.reduce(
      (accumulator, item) => accumulator + item.unit_cost_price * item.quantity,
      0
    );
    const totalProfit = totalAmount - totalCost;

    const saleItemsPayload = cart.map((item) => {
      const lineTotal = item.unit_sale_price * item.quantity;
      const lineCost = item.unit_cost_price * item.quantity;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_sale_price: item.unit_sale_price,
        unit_cost_price: item.unit_cost_price,
        line_total: lineTotal,
        line_cost: lineCost,
        line_profit: lineTotal - lineCost,
      };
    });

    if (editingSaleId) {
      const originalSale = sales.find((sale) => sale.id === editingSaleId);
      const originalItems = saleItemsBySaleId.get(editingSaleId) ?? [];

      if (!originalSale) {
        setError("No se encontró la venta original para editar.");
        return;
      }

      const { error: updateSaleError } = await supabase
        .from("sales")
        .update({
          client_id: resolvedClientId,
          note: saleNote.trim() || null,
          total_amount: totalAmount,
          total_cost: totalCost,
          total_profit: totalProfit,
        })
        .eq("id", editingSaleId)
        .eq("owner_id", session.user.id);

      if (updateSaleError) {
        setError(updateSaleError.message);
        return;
      }

      const { error: deleteItemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", editingSaleId);

      if (deleteItemsError) {
        setError(deleteItemsError.message);
        return;
      }

      const { error: insertEditedItemsError } = await supabase.from("sale_items").insert(
        saleItemsPayload.map((item) => ({ ...item, sale_id: editingSaleId }))
      );

      if (insertEditedItemsError) {
        setError(insertEditedItemsError.message);
        return;
      }

      const originalQuantities = new Map<string, number>();
      originalItems.forEach((item) => {
        originalQuantities.set(
          item.product_id,
          (originalQuantities.get(item.product_id) ?? 0) + Number(item.quantity)
        );
      });

      const newQuantities = new Map<string, number>();
      cart.forEach((item) => {
        newQuantities.set(item.product_id, (newQuantities.get(item.product_id) ?? 0) + item.quantity);
      });

      const affectedProducts = new Set([...originalQuantities.keys(), ...newQuantities.keys()]);
      const stockUpdates = [...affectedProducts].map((productId) => {
        const product = productsById.get(productId);
        if (!product) return Promise.resolve({ error: null });

        const originalQuantity = originalQuantities.get(productId) ?? 0;
        const newQuantity = newQuantities.get(productId) ?? 0;
        const newStock = Math.max(0, Number(product.stock) + originalQuantity - newQuantity);

        return supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", productId)
          .eq("owner_id", session.user.id);
      });

      const stockResults = await Promise.all(stockUpdates);
      const stockError = stockResults.find((result) => result.error)?.error;
      if (stockError) {
        setError(stockError.message);
        return;
      }

      resetSaleEditor();
      await loadData(session.user.id);
      return;
    }

    const { data: saleInserted, error: saleError } = await supabase
      .from("sales")
      .insert({
        owner_id: session.user.id,
        client_id: resolvedClientId,
        sold_at: new Date().toISOString(),
        note: saleNote.trim() || null,
        total_amount: totalAmount,
        total_cost: totalCost,
        total_profit: totalProfit,
      })
      .select("id")
      .single();

    if (saleError || !saleInserted) {
      setError(saleError?.message ?? "No se pudo guardar la venta.");
      return;
    }

    const { error: itemsError } = await supabase.from("sale_items").insert(
      saleItemsPayload.map((item) => ({ ...item, sale_id: saleInserted.id }))
    );
    if (itemsError) {
      setError(itemsError.message);
      await supabase.from("sales").delete().eq("id", saleInserted.id);
      return;
    }

    const stockUpdates = cart.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return Promise.resolve({ error: null });

      const newStock = Math.max(0, Number(product.stock) - item.quantity);
      return supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", product.id)
        .eq("owner_id", session.user.id);
    });

    const stockResults = await Promise.all(stockUpdates);
    const stockError = stockResults.find((result) => result.error)?.error;
    if (stockError) {
      setError(stockError.message);
      return;
    }

    resetSaleEditor();
    await loadData(session.user.id);
  };

  const applyDashboardPreset = (selectedRange: Exclude<Range, "custom">) => {
    const nextDates = getPresetRangeDates(selectedRange);
    setRange(selectedRange);
    setDashboardStartDate(nextDates.start);
    setDashboardEndDate(nextDates.end);
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = format(parseISO(sale.sold_at), "yyyy-MM-dd");
      const effectiveStartDate =
        dashboardStartDate && dashboardEndDate && dashboardStartDate > dashboardEndDate
          ? dashboardEndDate
          : dashboardStartDate;
      const effectiveEndDate =
        dashboardStartDate && dashboardEndDate && dashboardStartDate > dashboardEndDate
          ? dashboardStartDate
          : dashboardEndDate;

      if (effectiveStartDate && saleDate < effectiveStartDate) return false;
      if (effectiveEndDate && saleDate > effectiveEndDate) return false;
      return true;
    });
  }, [dashboardEndDate, dashboardStartDate, sales]);

  const totals = useMemo(() => {
    const totalAmount = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_amount),
      0
    );
    const totalCost = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_cost),
      0
    );
    const totalProfit = filteredSales.reduce(
      (accumulator, sale) => accumulator + Number(sale.total_profit),
      0
    );
    const ticketAverage = filteredSales.length ? totalAmount / filteredSales.length : 0;

    return {
      totalAmount,
      totalCost,
      totalProfit,
      ticketAverage,
      count: filteredSales.length,
    };
  }, [filteredSales]);

  const chartData = useMemo(() => {
    const mapByDay = new Map<string, { day: string; ingreso: number; ganancia: number }>();

    filteredSales.forEach((sale) => {
      const day = format(parseISO(sale.sold_at), "dd/MM");
      const prev = mapByDay.get(day);
      if (prev) {
        prev.ingreso += Number(sale.total_amount);
        prev.ganancia += Number(sale.total_profit);
      } else {
        mapByDay.set(day, {
          day,
          ingreso: Number(sale.total_amount),
          ganancia: Number(sale.total_profit),
        });
      }
    });

    return [...mapByDay.values()];
  }, [filteredSales]);

  const cartTotal = cart.reduce(
    (accumulator, item) => accumulator + item.unit_sale_price * item.quantity,
    0
  );

  const filteredSalesHistory = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = format(parseISO(sale.sold_at), "yyyy-MM-dd");
      if (historyStartDate && saleDate < historyStartDate) return false;
      if (historyEndDate && saleDate > historyEndDate) return false;
      return true;
    });
  }, [historyEndDate, historyStartDate, sales]);

  const filteredSaleItems = useMemo(() => {
    const filteredSaleIds = new Set(filteredSales.map((sale) => sale.id));
    return saleItems.filter((item) => filteredSaleIds.has(item.sale_id));
  }, [filteredSales, saleItems]);

  const rankingData = useMemo(() => {
    const productStats = new Map<
      string,
      {
        productId: string;
        name: string;
        quantity: number;
        revenue: number;
        cost: number;
        profit: number;
      }
    >();

    filteredSaleItems.forEach((item) => {
      const product = productsById.get(item.product_id);
      const current = productStats.get(item.product_id) ?? {
        productId: item.product_id,
        name: product?.name ?? "Producto",
        quantity: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };

      current.quantity += Number(item.quantity);
      current.revenue += Number(item.line_total);
      current.cost += Number(item.line_cost);
      current.profit += Number(item.line_profit);

      productStats.set(item.product_id, current);
    });

    const items = [...productStats.values()];

    return {
      mostSold: [...items].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      highestProfit: [...items].sort((a, b) => b.profit - a.profit).slice(0, 5),
      lowestMargin: [...items]
        .map((item) => ({
          ...item,
          unitMargin: item.quantity > 0 ? item.profit / item.quantity : 0,
        }))
        .sort((a, b) => a.unitMargin - b.unitMargin)
        .slice(0, 5),
    };
  }, [filteredSaleItems, productsById]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter(
        (product) => product.is_active && Number(product.stock_min) > 0 && Number(product.stock) <= Number(product.stock_min)
      )
      .sort((a, b) => Number(a.stock) - Number(b.stock));
  }, [products]);

  const bestSalesDay = useMemo(() => {
    const dayMap = new Map<string, { label: string; total: number; profit: number; salesCount: number }>();

    filteredSales.forEach((sale) => {
      const key = format(parseISO(sale.sold_at), "yyyy-MM-dd");
      const current = dayMap.get(key) ?? {
        label: format(parseISO(sale.sold_at), "dd/MM/yyyy"),
        total: 0,
        profit: 0,
        salesCount: 0,
      };

      current.total += Number(sale.total_amount);
      current.profit += Number(sale.total_profit);
      current.salesCount += 1;

      dayMap.set(key, current);
    });

    return [...dayMap.values()].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [filteredSales]);

  const clientSummary = useMemo(() => {
    const stats = new Map<
      string,
      {
        id: string;
        name: string;
        purchases: number;
        totalAmount: number;
        totalProfit: number;
        lastPurchase: string;
      }
    >();

    sales.forEach((sale) => {
      if (!sale.client_id) return;

      const client = clientsById.get(sale.client_id);
      const current = stats.get(sale.client_id) ?? {
        id: sale.client_id,
        name: client?.name ?? "Cliente",
        purchases: 0,
        totalAmount: 0,
        totalProfit: 0,
        lastPurchase: sale.sold_at,
      };

      current.purchases += 1;
      current.totalAmount += Number(sale.total_amount);
      current.totalProfit += Number(sale.total_profit);
      if (sale.sold_at > current.lastPurchase) {
        current.lastPurchase = sale.sold_at;
      }

      stats.set(sale.client_id, current);
    });

    return [...stats.values()].sort((a, b) => b.purchases - a.purchases || b.totalAmount - a.totalAmount);
  }, [clientsById, sales]);

  if (!supabase) {
    return (
      <main className="min-h-screen bg-zinc-100 p-6 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-300 bg-white p-6">
          <h1 className="text-xl font-semibold">Configurar variables de entorno</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Creá el archivo <strong>.env.local</strong> con <strong>NEXT_PUBLIC_SUPABASE_URL</strong> y
            <strong> NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>.
          </p>
        </div>
      </main>
    );
  }

  if (bootLoading) {
    return (
      <main className="min-h-screen bg-zinc-100 p-6 text-zinc-900">
        <div className="mx-auto max-w-5xl">Cargando...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-slate-100 p-6">
        <form
          onSubmit={signInOrRegister}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl"
        >
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow">
              A
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Admin de Negocio</h1>
              <p className="text-xs text-slate-500">Gestioná tu negocio desde un solo lugar</p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Email
              <input
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Contraseña
              <input
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            className="mt-6 h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700"
            type="submit"
          >
            {isRegister ? "Crear usuario" : "Ingresar"}
          </button>

          <button
            className="mt-2 h-10 w-full rounded-lg border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50"
            type="button"
            onClick={() => {
              setError(null);
              setIsRegister((prev) => !prev);
            }}
          >
            {isRegister ? "Ya tengo cuenta" : "No tengo cuenta"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              A
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Admin de Negocio</h1>
              <p className="text-xs text-slate-400">{session.user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveView("dashboard")}
              className={`h-9 rounded-lg px-4 text-sm font-medium transition ${
                activeView === "dashboard"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveView("ventas")}
              className={`h-9 rounded-lg px-4 text-sm font-medium transition ${
                activeView === "ventas"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Ventas
            </button>
            <button
              onClick={() => setActiveView("productos")}
              className={`h-9 rounded-lg px-4 text-sm font-medium transition ${
                activeView === "productos"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setActiveView("clientes")}
              className={`h-9 rounded-lg px-4 text-sm font-medium transition ${
                activeView === "clientes"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Clientes
            </button>
            <div className="ml-1 h-5 w-px bg-slate-200" />
            <button
              onClick={signOut}
              className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            >
              Salir
            </button>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <span className="mt-0.5 text-red-500">⚠</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {pageLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            <p className="text-sm text-indigo-700">Actualizando datos...</p>
          </div>
        )}

        {activeView === "dashboard" && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Rango</span>
                {(["day", "week", "month"] as const).map((r) => (
                  <button
                    key={r}
                    className={`h-8 rounded-lg px-3 text-sm font-medium transition ${
                      range === r
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => applyDashboardPreset(r)}
                  >
                    {r === "day" ? "Hoy" : r === "week" ? "Semana" : "Mes"}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-medium text-slate-500">
                  Desde
                  <input
                    type="date"
                    value={dashboardStartDate}
                    onChange={(event) => {
                      setRange("custom");
                      setDashboardStartDate(event.target.value);
                    }}
                    className="h-8 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-500">
                  Hasta
                  <input
                    type="date"
                    value={dashboardEndDate}
                    onChange={(event) => {
                      setRange("custom");
                      setDashboardEndDate(event.target.value);
                    }}
                    className="h-8 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <button
                  onClick={() => applyDashboardPreset("month")}
                  className="h-8 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  Restablecer
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Ingresos</p>
                  <span className="text-lg text-blue-400">💰</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-700">{formatCurrency(totals.totalAmount)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Costo</p>
                  <span className="text-lg text-amber-400">📦</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(totals.totalCost)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Ganancia</p>
                  <span className="text-lg text-emerald-400">📈</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(totals.totalProfit)}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Ventas</p>
                  <span className="text-lg text-violet-400">🛒</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-violet-700">{totals.count}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Ticket promedio</p>
                  <span className="text-lg text-sky-400">🎯</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-sky-700">{formatCurrency(totals.ticketAverage)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏆</span>
                  <h2 className="text-sm font-bold text-amber-700">Mejor día del período</h2>
                </div>
                {bestSalesDay ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400">Fecha</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{bestSalesDay.label}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400">Ventas</p>
                      <p className="mt-1 text-sm font-bold text-blue-700">{formatCurrency(bestSalesDay.total)}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400">Ganancia</p>
                      <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(bestSalesDay.profit)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-amber-600">Todavía no hay ventas en este período.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <h2 className="text-sm font-bold text-slate-700">Alertas de stock bajo</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Mínimo por producto</span>
                </div>
                <div className="mt-3 space-y-2">
                  {lowStockProducts.length === 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                      <span className="text-emerald-500">✓</span>
                      <p className="text-sm text-emerald-700">Todos los productos tienen stock suficiente.</p>
                    </div>
                  )}
                  {lowStockProducts.slice(0, 6).map((product) => (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                        Number(product.stock) <= 0
                          ? "border border-red-200 bg-red-50"
                          : "border border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          Mínimo {formatQuantity(Number(product.stock_min))} · precio {formatCurrency(Number(product.sale_price))}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          Number(product.stock) <= 0
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {Number(product.stock) <= 0 ? "Sin stock" : `Stock ${formatQuantity(Number(product.stock))}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h2 className="text-sm font-bold text-slate-700">Evolución del período</h2>
              </div>
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.07)" }}
                      formatter={(value) => [typeof value === "number" ? formatCurrency(value) : String(value)]}
                    />
                    <Bar dataKey="ingreso" fill="#6366f1" name="Ingresos" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ganancia" fill="#10b981" name="Ganancia" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗓️</span>
                <h2 className="text-sm font-bold text-slate-700">Últimas ventas</h2>
              </div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="rounded-l-lg py-2.5 pl-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Fecha</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Importe</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Costo</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Ganancia</th>
                      <th className="rounded-r-lg py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 12).map((sale) => (
                      <tr key={sale.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                        <td className="py-2.5 pl-3 text-slate-600">{format(parseISO(sale.sold_at), "dd/MM/yyyy HH:mm")}</td>
                        <td className="py-2.5 font-medium text-blue-700">{formatCurrency(Number(sale.total_amount))}</td>
                        <td className="py-2.5 text-amber-700">{formatCurrency(Number(sale.total_cost))}</td>
                        <td className="py-2.5 font-semibold text-emerald-700">{formatCurrency(Number(sale.total_profit))}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{sale.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🌟</span>
                  <h2 className="text-sm font-bold text-slate-700">Más vendidos</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {rankingData.mostSold.length === 0 && (
                    <p className="text-sm text-slate-400">Sin datos para este período.</p>
                  )}
                  {rankingData.mostSold.map((item, index) => (
                    <div key={`${item.productId}-sold`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <span className={`text-base font-bold ${
                        index === 0 ? "text-amber-400" : index === 1 ? "text-slate-400" : index === 2 ? "text-amber-700" : "text-slate-300"
                      }`}>{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">Ingresó {formatCurrency(item.revenue)}</p>
                      </div>
                      <span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{formatQuantity(item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💵</span>
                  <h2 className="text-sm font-bold text-slate-700">Mayor ganancia</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {rankingData.highestProfit.length === 0 && (
                    <p className="text-sm text-slate-400">Sin datos para este período.</p>
                  )}
                  {rankingData.highestProfit.map((item, index) => (
                    <div key={`${item.productId}-profit`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <span className={`text-base font-bold ${
                        index === 0 ? "text-amber-400" : index === 1 ? "text-slate-400" : index === 2 ? "text-amber-700" : "text-slate-300"
                      }`}>{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">Cant. {formatQuantity(item.quantity)}</p>
                      </div>
                      <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">{formatCurrency(item.profit)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📌</span>
                  <h2 className="text-sm font-bold text-slate-700">Menor margen</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {rankingData.lowestMargin.length === 0 && (
                    <p className="text-sm text-slate-400">Sin datos para este período.</p>
                  )}
                  {rankingData.lowestMargin.map((item, index) => (
                    <div key={`${item.productId}-margin`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <span className={`text-base font-bold ${
                        index === 0 ? "text-red-500" : index === 1 ? "text-orange-400" : "text-amber-400"
                      }`}>{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">Gan. total {formatCurrency(item.profit)}</p>
                      </div>
                      <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">{formatCurrency(item.unitMargin)} / u.</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "ventas" && (
          <section className="space-y-5">
            {editingSaleId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">✏️</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">Editando una venta existente</p>
                    <p className="text-xs text-amber-600">Modificá los productos y guardá para actualizar.</p>
                  </div>
                </div>
                <button
                  onClick={resetSaleEditor}
                  className="h-9 rounded-lg border border-amber-400 bg-white px-4 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                >
                  Cancelar edición
                </button>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{editingSaleId ? "✏️" : "➕"}</span>
                  <h2 className="text-sm font-bold text-slate-700">{editingSaleId ? "Editar venta" : "Cargar venta del día"}</h2>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-medium text-slate-600">Producto</span>
                    <div className="relative">
                      <input
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setProductDropdownOpen(true);
                          if (!e.target.value) setSelectedProductId("");
                        }}
                        onFocus={() => setProductDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
                        placeholder="Buscar producto..."
                      />
                      {productDropdownOpen && filteredActiveProducts.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {filteredActiveProducts.map((product) => (
                            <li
                              key={product.id}
                              className="cursor-pointer px-3 py-2.5 text-sm transition hover:bg-indigo-50 hover:text-indigo-700"
                              onMouseDown={() => {
                                setSelectedProductId(product.id);
                                setProductSearch(product.name);
                                setProductDropdownOpen(false);
                              }}
                            >
                              <span className="font-medium">{product.name}</span>
                              <span className="ml-2 text-xs text-slate-400">Stock {formatQuantity(Number(product.stock))} · {formatCurrency(Number(product.sale_price))} / u.</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-slate-600">Cantidad</span>
                      <input
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        type="number"
                        min={0.001}
                        step="0.001"
                        value={selectedQuantity}
                        onChange={(event) => setSelectedQuantity(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-slate-600">Precio total de venta</span>
                      <input
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={selectedSalePrice}
                        onChange={(event) => setSelectedSalePrice(event.target.value)}
                        placeholder="Total por los litros"
                      />
                    </label>
                  </div>

                  <div className={`rounded-xl border px-4 py-3 text-sm ${
                    selectedUnitSalePrice !== null
                      ? "border-indigo-100 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}>
                    {selectedUnitSalePrice !== null
                      ? <><span className="font-semibold">Precio por litro: </span>{formatCurrency(selectedUnitSalePrice)}</>
                      : "Ingresá cantidad y precio total para calcular."}
                  </div>

                  <button
                    onClick={addItemToCart}
                    className="h-10 rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    + Agregar al carrito
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛒</span>
                  <h2 className="text-sm font-bold text-slate-700">Carrito</h2>
                  {cart.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">{cart.length}</span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {cart.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
                      <p className="text-sm text-slate-400">No hay productos en el carrito.</p>
                    </div>
                  )}
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.product_name}</p>
                        <p className="text-xs text-slate-400">
                          {formatQuantity(item.quantity)} u. · {formatCurrency(item.quantity * item.unit_sale_price)} total · costo {formatCurrency(item.quantity * item.unit_cost_price)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-slate-600">Cliente (opcional)</span>
                    <select
                      value={saleClientId}
                      onChange={(event) => setSaleClientId(event.target.value)}
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="">Sin cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-slate-600">O escribir cliente nuevo</span>
                    <input
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={newClientName}
                      onChange={(event) => setNewClientName(event.target.value)}
                      placeholder="Ej: Juan Pérez"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-slate-600">Nota (opcional)</span>
                    <input
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={saleNote}
                      onChange={(event) => setSaleNote(event.target.value)}
                      placeholder="Ej: entrega barrio centro"
                    />
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-400">Total del carrito</p>
                    <p className="text-xl font-bold text-slate-900">{formatCurrency(cartTotal)}</p>
                  </div>
                  <button
                    onClick={confirmSale}
                    className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white transition hover:bg-emerald-700"
                  >
                    {editingSaleId ? "✓ Actualizar venta" : "✓ Guardar venta"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-300 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">Historial de ventas</h2>
                  <p className="text-xs text-zinc-500">Buscá por fecha y desplegá el detalle solo cuando lo necesites.</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-sm">
                    Desde
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(event) => setHistoryStartDate(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Hasta
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(event) => setHistoryEndDate(event.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3"
                    />
                  </label>
                  <div className="flex h-10 items-end">
                    <button
                      onClick={() => {
                        setHistoryStartDate("");
                        setHistoryEndDate("");
                      }}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {filteredSalesHistory.length === 0 && (
                  <p className="text-sm text-zinc-500">No hay ventas para el rango seleccionado.</p>
                )}

                {filteredSalesHistory.map((sale) => {
                  const items = saleItemsBySaleId.get(sale.id) ?? [];
                  const isExpanded = expandedSaleIds.includes(sale.id);

                  return (
                    <div key={sale.id} className="rounded-xl border border-zinc-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-[220px] flex-1">
                          <p className="text-base font-medium">
                            Venta del {format(parseISO(sale.sold_at), "dd/MM/yyyy HH:mm")}
                          </p>
                          <p className="text-sm text-zinc-500">
                            Cliente: {sale.client_id ? (clientsById.get(sale.client_id)?.name ?? "Cliente") : "Sin cliente"}
                          </p>
                          <p className="text-sm text-zinc-500">{sale.note ?? "Sin nota"}</p>
                        </div>

                        <div className="grid min-w-[240px] gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-zinc-500">Total</p>
                            <p className="text-sm font-medium">{formatCurrency(Number(sale.total_amount))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Costo</p>
                            <p className="text-sm font-medium">{formatCurrency(Number(sale.total_cost))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500">Ganancia</p>
                            <p className="text-sm font-medium text-green-700">{formatCurrency(Number(sale.total_profit))}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => toggleSaleExpanded(sale.id)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-xs"
                          >
                            {isExpanded ? "Ocultar detalle" : `Ver detalle (${items.length})`}
                          </button>
                          <button
                            onClick={() => startEditingSale(sale)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-xs"
                          >
                            {editingSaleId === sale.id ? "Editando" : "Editar"}
                          </button>
                          <button
                            onClick={() => voidSale(sale.id)}
                            className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-700"
                          >
                            Anular
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 overflow-auto border-t border-zinc-200 pt-4">
                          <table className="w-full min-w-[760px] text-sm">
                            <thead>
                              <tr className="border-b border-zinc-200 text-left">
                                <th className="py-2">Producto</th>
                                <th className="py-2">Litros</th>
                                <th className="py-2">Precio total</th>
                                <th className="py-2">Costo</th>
                                <th className="py-2">Ganancia</th>
                                <th className="py-2">Precio x litro</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item) => (
                                <tr key={item.id} className="border-b border-zinc-100">
                                  <td className="py-2">{productsById.get(item.product_id)?.name ?? "Producto"}</td>
                                  <td className="py-2">{formatQuantity(Number(item.quantity))}</td>
                                  <td className="py-2">{formatCurrency(Number(item.line_total))}</td>
                                  <td className="py-2">{formatCurrency(Number(item.line_cost))}</td>
                                  <td className="py-2">{formatCurrency(Number(item.line_profit))}</td>
                                  <td className="py-2">{formatCurrency(Number(item.unit_sale_price))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeView === "productos" && (
          <section className="space-y-5">
            <form onSubmit={addProduct} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xl">➕</span>
                <h2 className="text-sm font-bold text-slate-700">Nuevo producto</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Nombre"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Costo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productCost}
                  onChange={(event) => setProductCost(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Precio venta"
                  type="number"
                  step="0.01"
                  min={0}
                  value={productSalePrice}
                  onChange={(event) => setProductSalePrice(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Stock"
                  type="number"
                  step="0.001"
                  min={0}
                  value={productStock}
                  onChange={(event) => setProductStock(event.target.value)}
                  required
                />
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Stock mínimo"
                  type="number"
                  step="0.001"
                  min={0}
                  value={productStockMin}
                  onChange={(event) => setProductStockMin(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className="mt-4 h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700">
                + Guardar producto
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📦</span>
                  <h2 className="text-sm font-bold text-slate-700">Listado</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{filteredProductsList.length}</span>
                </div>
                <input
                  className="h-9 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Buscar producto"
                  value={productListSearch}
                  onChange={(event) => setProductListSearch(event.target.value)}
                />
              </div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="rounded-l-lg py-2.5 pl-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Producto</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Costo</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Precio</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Margen</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Stock</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Mínimo</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</th>
                      <th className="rounded-r-lg py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductsList.length === 0 && (
                      <tr>
                        <td className="py-4 text-slate-400" colSpan={8}>
                          No se encontraron productos.
                        </td>
                      </tr>
                    )}
                    {filteredProductsList.map((product) => {
                      const margin = Number(product.sale_price) - Number(product.cost_price);
                      const isLowStock = Number(product.stock_min) > 0 && Number(product.stock) <= Number(product.stock_min);
                      return (
                        <tr key={product.id} className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                          !product.is_active ? "opacity-50" : ""
                        }`}>
                          <td className="py-2.5 pl-3 font-semibold text-slate-800">{product.name}</td>
                          <td className="py-2.5 text-amber-700">{formatCurrency(Number(product.cost_price))}</td>
                          <td className="py-2.5 text-blue-700">{formatCurrency(Number(product.sale_price))}</td>
                          <td className="py-2.5 font-semibold text-emerald-700">{formatCurrency(margin)}</td>
                          <td className={`py-2.5 font-semibold ${
                            isLowStock ? "text-red-600" : "text-slate-700"
                          }`}>{formatQuantity(Number(product.stock))}</td>
                          <td className="py-2.5 text-slate-500">{formatQuantity(Number(product.stock_min))}</td>
                          <td className="py-2.5">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              product.is_active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {product.is_active ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => quickEditProduct(product)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => toggleProductActive(product)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                  product.is_active
                                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {product.is_active ? "Desactivar" : "Activar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeView === "clientes" && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xl">👥</span>
                <h2 className="text-sm font-bold text-slate-700">Clientes</h2>
              </div>
              <p className="ml-8 mt-0.5 text-xs text-slate-400">
                Solo aparecen clientes asociados a alguna venta.
              </p>

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="rounded-l-lg py-2.5 pl-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Cliente</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Compras</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Total comprado</th>
                      <th className="py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Ganancia generada</th>
                      <th className="rounded-r-lg py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Última compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSummary.length === 0 && (
                      <tr>
                        <td className="py-8 text-center text-slate-400" colSpan={5}>
                          Todavía no hay clientes asociados a ventas.
                        </td>
                      </tr>
                    )}
                    {clientSummary.map((client) => (
                      <tr key={client.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                        <td className="py-2.5 pl-3 font-semibold text-slate-800">{client.name}</td>
                        <td className="py-2.5">
                          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">{client.purchases}</span>
                        </td>
                        <td className="py-2.5 font-semibold text-blue-700">{formatCurrency(client.totalAmount)}</td>
                        <td className="py-2.5 font-semibold text-emerald-700">{formatCurrency(client.totalProfit)}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{format(parseISO(client.lastPurchase), "dd/MM/yyyy HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
