let

    Source = try

        Csv.Document(File.Contents(DataFolder & "\Amazon Sales data.csv"), [
        Delimiter=",",
        Columns=14,
        Encoding=65001,
        QuoteStyle=QuoteStyle.None
    ])

    otherwise

        #table({"Region", "Country", "Item Type", "Sales Channel", "Order Priority", "Order Date", "Order ID", "Ship Date", "Units Sold", "Unit Price", "Unit Cost", "Total Revenue", "Total Cost", "Total Profit"}, {}),
    #"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    #"Changed Types" = Table.TransformColumnTypes(#"Promoted Headers", {
        {"Region", type text},
        {"Country", type text},
        {"Item Type", type text},
        {"Sales Channel", type text},
        {"Order Priority", type text},
        {"Order Date", type date},
        {"Order ID", Int64.Type},
        {"Ship Date", type date},
        {"Units Sold", Int64.Type},
        {"Unit Price", type number},
        {"Unit Cost", type number},
        {"Total Revenue", type number},
        {"Total Cost", type number},
        {"Total Profit", type number}
    }),
    #"Added Action (Country)" = Table.AddColumn(#"Changed Types", "Action (Country)", each Text.From([#"Country"]), type text),
    #"Added Action (Item Type)" = Table.AddColumn(#"Added Action (Country)", "Action (Item Type)", each Text.From([#"Item Type"]), type text),
    Result = #"Added Action (Item Type)"
in
    Result