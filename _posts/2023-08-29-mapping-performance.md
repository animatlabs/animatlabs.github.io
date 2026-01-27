---
title: ".NET: Exploring various object transformation mappers including XSLT"
excerpt: >-
  "Exploring various object transformation mappers including XSLT"
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - XSLT
  - Mapping
  - Performance
author: animat089
last_modified_at: 2023-08-29
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Based on the requirements of the organization/project, we may end up choosing the tech on how do we wish to map objects in a commercial project. Now to a many, this might seem to be a thing like what are you saying. How, can this we such a big thing?...It can be, just explore with me the possibilities I present here and lets take it from there.

There are may object to object mapping libraries available in the world as of right now, One such example is `AutoMapper`; there are other libraries in the community like `Mapster` to do the same. On the other hand, there are other parsing and transforming solutions like `XSLT` (Extensible Stylesheet Language Transformations). 

> In the world of .NET the inbuilt library only supports `XSL v1.0` with `XSLTCompiledTransform`, there are other paid libraries like that from Saxon that work with the latest and the greatest and provide other functionalities like `XSpec` (unit-testing for XSLT) testing seamlessly.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/Benchmarking/Mapping){: .btn .btn--primary}

## Results First - Let's blow your mind...

To set the context, let's take a case of an API that needs to read an XML and then map it to another object and then revert return a string response downstream. Here, we would be looking at the conventional ways to solve the solution like general object-object mapping and then delve into other patterns as well. Now, looking for the strategies to be followed given we have an XML file that we need to map the object from there are only given set of ways we do the transformations:

1. XMLDocument - Extract the required props using XPath for the values required
2. ModelToModel - Deserialize input to C# classes and map those classes
3. AutoMapper - Use AutoMapper to perform the mapping instead explicit manual mapping
4. XSLT -> XML - Use XSLT to convert the input to XML and then to Json
5. XSLT -> JSON - Use XSLT to convert the input to Json
6. XSLT -> JSON - Use XSLT to convert the input to Text like Json

| Method               | Mean      | Error     | StdDev    | Allocated |
|--------------------- |----------:|----------:|----------:|----------:|
| XmlDocToModelMapping | 10.373 us | 0.1684 us | 0.2949 us |  15.84 KB |
| ModelToModelMapping  |  2.260 us | 0.0441 us | 0.0573 us |   2.49 KB |
| AutoMapperMapping    |  2.583 us | 0.0439 us | 0.0925 us |   2.68 KB |
| XsltXMLMapping       | 18.056 us | 0.3144 us | 0.2940 us |  41.54 KB |
| XsltJsonMapping      |  8.359 us | 0.1631 us | 0.2062 us |  37.46 KB |
| XsltTextMapping      |  3.338 us | 0.0383 us | 0.0320 us |  17.66 KB |

> What we observer here is that both speed and memory wise, direct model to model mapping beats everyone to the game. The methods had been setup to not read the required files but just to map and generate a string result!

## Looking into the implementations

So, to begin it off lets look into sample set data and what is the expectation that we are trying to achieve from all the variants.

### Global Setup

So, let's talk about the sample xml, that we are looking into as of right now:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<root>
	<person>
		<name>John Doe</name>
		<position>Manager</position>
		<age>30</age>
	</person>
	<book>
		<title>XML Essentials</title>
		<author>Alice Johnson</author>
		<publicationYear>2022</publicationYear>
	</book>
	<company>
		<name>ABC Corporation</name>
		<city>Chicago</city>
		<state>IL</state>
	</company>
</root>
```

As we can observe above, the xml has person, book and company at the root level and the expectation in the output is to have a model that encompasses company as response with has list of employees as persons inside them and then list of books associated to the employees. Therefore setting up the target classes:

```c#
public class Response
{
    public Company Company { get; set; }
}

public class Company
{
    public string Name { get; set; }
    public string City { get; set; }
    public string State { get; set; }
    public IEnumerable<Person> Employees { get; set; }
}

public class Book
{
    public string Title { get; set; }
    public string Author { get; set; }
    public string PublicationYear { get; set; }
}

public class Person
{
    public string Name { get; set; }
    public int Age { get; set; }
    public string Position { get; set; }
    public IEnumerable<Book> Books { get; set; }
}
```

Now, loading the required details into the required classes, as follows:

```c#
private static XmlDocument doc = new();
private static root root;
private static IMapper map;
private static XslCompiledTransform xsltXml = new();
private static XslCompiledTransform xsltText = new();
private static XslCompiledTransform xsltJson = new(true);

[GlobalSetup]
public void SetupData()
{
    // Load the original document
    var xmlReader = XmlReader.Create(new StringReader(File.ReadAllText("BaseFiles/Sample.xml")));
    doc.Load(xmlReader);

    // Setting up Automapper Configuration
    var config = new MapperConfiguration(cfg =>
    {
        cfg.CreateMap<root, Book>()
            .ForMember(dest => dest.Title, opt => opt.MapFrom(src => src.book.title))
            .ForMember(dest => dest.PublicationYear, opt => opt.MapFrom(src => src.book.publicationYear))
            .ForMember(dest => dest.Author, opt => opt.MapFrom(src => src.book.author));

        cfg.CreateMap<root, Person>()
            .ForMember(dest => dest.Name, opt => opt.MapFrom(src => src.person.name))
            .ForMember(dest => dest.Position, opt => opt.MapFrom(src => src.person.position))
            .ForMember(dest => dest.Age, opt => opt.MapFrom(src => src.person.age))
            .ForMember(dest => dest.Books, opt => opt.MapFrom(src => new[] { src }));

        cfg.CreateMap<root, Company>()
            .ForMember(dest => dest.Name, opt => opt.MapFrom(src => src.company.name))
            .ForMember(dest => dest.City, opt => opt.MapFrom(src => src.company.city))
            .ForMember(dest => dest.State, opt => opt.MapFrom(src => src.company.state))
            .ForMember(dest => dest.Employees, opt => opt.MapFrom(src => new[] { src }));

        cfg.CreateMap<root, Response>()
            .ForMember(dest => dest.Company, opt => opt.MapFrom(src => src));

    });
    map = config.CreateMapper();

    // Since we cannot reset an xmlreader and we need to load the target
    xmlReader = XmlReader.Create(new StringReader(File.ReadAllText("BaseFiles/Sample.xml")));
    root = (root)new XmlSerializer(typeof(root)).Deserialize(xmlReader);

    xsltXml.Load("BaseFiles/ConvertXML.xslt");
    xsltText.Load("BaseFiles/ConvertText.xslt");
    xsltJson.Load("BaseFiles/ConvertJson.xslt");
}
```

### XMLDocToModel Mapping

In this case, we look forward to directly parse the xml document in to the model via XPath, what we observe here is that using the actual path of the elements in the file, we are mapping each and every property one by one.

```c#
[Benchmark]
public void XmlDocToModelMapping()
{
    var book = new Book()
    {
        Author = GetValue(doc, "/root/book/author"),
        PublicationYear = GetValue(doc, "/root/book/publicationYear"),
        Title = GetValue(doc, "/root/book/title"),
    };
    var person = new Person()
    {
        Age = Convert.ToInt32(GetValue(doc, "/root/person/age")),
        Name = GetValue(doc, "/root/person/name"),
        Position = GetValue(doc, "/root/person/position"),
        Books = new[] { book }
    };
    var company = new Company()
    {
        City = GetValue(doc, "/root/company/city"),
        Name = GetValue(doc, "/root/company/name"),
        State = GetValue(doc, "/root/company/state"),
        Employees = new[] { person }
    };
    var response = new Response()
    {
        Company = company
    };

    var output = JsonConvert.SerializeObject(response);

    // PrintJson(output);
}

private string GetValue(XmlDocument xmlDocument, string path)
{
    return xmlDocument.SelectSingleNode(path)?.InnerText;
}
```

### ModelToModel Mapping

In this case, we look forward to parse the xml document into a source C# model and then map it to the target model, what we observe here is that using the we are mapping each and every property one by one from model to model.

```c#
[Benchmark]
public void ModelToModelMapping()
{
    var book = new Book()
    {
        Author = root.book.author,
        PublicationYear = root.book.publicationYear.ToString(),
        Title = root.book.title
    };
    var person = new Person()
    {
        Age = root.person.age,
        Name = root.person.name,
        Position = root.person.position,
        Books = new[] { book }
    };
    var company = new Company()
    {
        City = root.company.city,
        Name = root.company.name,
        State = root.company.state,
        Employees = new[] { person }
    };
    var response = new Response()
    {
        Company = company
    };

    var output = JsonConvert.SerializeObject(response);

    // PrintJson(output);
}
```

### AutoMapperModel Mapping

In this case, we look forward to directly parse the xml document in to the model an then use Automapper to map it into the target model, with the configuration that was defined in the global setup.

```c#
[Benchmark]
public void AutoMapperMapping()
{
    var output = JsonConvert.SerializeObject(map.Map<Response>(root));

    // PrintJson(output);
}
```

### XSLT -> XML Mapping

In this case, we look forward to directly transform the xml document into target structure without use of any classes. Although XSLT load configuration was done as part of the global setup, we will work towards setting those up here. What we will observe here is that there is an additional step that converts the xml output to json and therefore it is expected to take more time, as that was the expected outcome!

```xml
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="xml" indent="yes" omit-xml-declaration="yes"/>

	<xsl:template match="/">
		<company>
			<xsl:copy-of select="root/company/*"/>
			<employees>
				<xsl:apply-templates select="root/person"/>
			</employees>
		</company>
	</xsl:template>

	<xsl:template match="person">
		<xsl:copy-of select="name|position|age"/>
		<books>
			<xsl:apply-templates select="/root/book"/>
		</books>
	</xsl:template>

	<xsl:template match="book">
		<xsl:copy-of select="title|author|publicationYear"/>
	</xsl:template>
</xsl:stylesheet>
```

```c#
[Benchmark]
public void XsltXMLMapping()
{
    string output = String.Empty;
    using (StringWriter sw = new StringWriter())
    using (XmlWriter xwo = XmlWriter.Create(sw, xsltXml.OutputSettings))
    {
        xsltXml.Transform(doc, xwo);
        output = JsonConvert.SerializeXNode(XDocument.Parse(sw.ToString()));
    }
    
    // PrintJson(output);
}
```

### XSLT -> Json Mapping

In this case, we look forward to directly transform the xml document into target structure without use of any classes but this time directly into JSON. Although, the XSLCompile Transform only supports XSL v1.0 (which does not have json rendering) but just making the version as 2.0 in the XSL let's us build and run the code, else it would not build itself.

```xml
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="json" indent="yes" omit-xml-declaration="yes"/>

	<xsl:template match="/">
		{
			"company": <xsl:apply-templates select="root/company"/>
		}
	</xsl:template>

	<xsl:template match="company">
		{
			"name": "<xsl:value-of select="name"/>",
			"city": "<xsl:value-of select="city"/>",
			"state": "<xsl:value-of select="state"/>",
			"employees": [<xsl:apply-templates select="/root/person"/>
			]
		}
	</xsl:template>

	<xsl:template match="person">
		{
			"name": "<xsl:value-of select="name"/>",
			"position": "<xsl:value-of select="position"/>",
			"age": <xsl:value-of select="age"/>,
			"books": [<xsl:apply-templates select="/root/book"/>
			]
		}
	</xsl:template>

	<xsl:template match="book">
		{
			"title": "<xsl:value-of select="title"/>",
			"author": "<xsl:value-of select="author"/>",
			"publicationYear": "<xsl:value-of select="publicationYear"/>",
		}
	</xsl:template>
</xsl:stylesheet>
```

```c#
[Benchmark]
public void XsltJsonMapping()
{
    string output = String.Empty;
    using (StringWriter sw = new StringWriter())
    using (XmlWriter xwo = XmlWriter.Create(sw, xsltJson.OutputSettings))
    {
        xsltJson.Transform(doc, xwo);
        output = sw.ToString();
    }

    // PrintJson(output);
}
```

### XSLT -> Json Mapping

In this case, we look forward to directly transform the xml document into target structure without use of any classes but this time directly into JSON. Although, the XSLCompile Transform only supports XSL v1.0 (which does not have json rendering) but just making the version as 2.0 in the XSL let's us build and run the code, else it would not build itself.

```xml
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="json" indent="yes" omit-xml-declaration="yes"/>

	<xsl:template match="/">
		{
			"company": <xsl:apply-templates select="root/company"/>
		}
	</xsl:template>

	<xsl:template match="company">
		{
			"name": "<xsl:value-of select="name"/>",
			"city": "<xsl:value-of select="city"/>",
			"state": "<xsl:value-of select="state"/>",
			"employees": [<xsl:apply-templates select="/root/person"/>
			]
		}
	</xsl:template>

	<xsl:template match="person">
		{
			"name": "<xsl:value-of select="name"/>",
			"position": "<xsl:value-of select="position"/>",
			"age": <xsl:value-of select="age"/>,
			"books": [<xsl:apply-templates select="/root/book"/>
			]
		}
	</xsl:template>

	<xsl:template match="book">
		{
			"title": "<xsl:value-of select="title"/>",
			"author": "<xsl:value-of select="author"/>",
			"publicationYear": "<xsl:value-of select="publicationYear"/>",
		}
	</xsl:template>
</xsl:stylesheet>
```

```c#
[Benchmark]
public void XsltJsonMapping()
{
    string output = String.Empty;
    using (StringWriter sw = new StringWriter())
    using (XmlWriter xwo = XmlWriter.Create(sw, xsltJson.OutputSettings))
    {
        xsltJson.Transform(doc, xwo);
        output = sw.ToString();
    }

    // PrintJson(output);
}
```

### XSLT -> Text Mapping

In this case, we look forward to directly transform the xml document into target structure without use of any classes but this time directly into JSON but as text.

```xml
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="text" omit-xml-declaration="yes"/>

	<xsl:template match="/">
		<xsl:text> {
			"company": </xsl:text><xsl:apply-templates select="root/company"/><xsl:text>
		}</xsl:text>
	</xsl:template>

	<xsl:template match="company">
		<xsl:text>{
			"name": </xsl:text>"<xsl:value-of select="name"/>"<xsl:text>,
			"city": </xsl:text>"<xsl:value-of select="city"/>"<xsl:text>,
			"state": </xsl:text>"<xsl:value-of select="state"/>"<xsl:text>,
			"employees": [</xsl:text><xsl:apply-templates select="/root/person"/><xsl:text>
			]
		}</xsl:text>
	</xsl:template>

	<xsl:template match="person">
		<xsl:text>{
			"name": </xsl:text>"<xsl:value-of select="name"/>"<xsl:text>,
			"position": </xsl:text>"<xsl:value-of select="position"/>"<xsl:text>,
			"age": </xsl:text><xsl:value-of select="age"/><xsl:text>,
			"books": [</xsl:text><xsl:apply-templates select="/root/book"/><xsl:text>
			]
		}</xsl:text>
	</xsl:template>

	<xsl:template match="book">
		<xsl:text>{
			"title": </xsl:text>"<xsl:value-of select="title"/>"<xsl:text>,
			"author": </xsl:text>"<xsl:value-of select="author"/>"<xsl:text>,
			"publicationYear": </xsl:text>"<xsl:value-of select="publicationYear"/>"<xsl:text>
		}</xsl:text>
	</xsl:template>
</xsl:stylesheet>
```

```c#
[Benchmark]
public void XsltTextMapping()
{
    string output = String.Empty;
    using (StringWriter sw = new StringWriter())
    using (XmlWriter xwo = XmlWriter.Create(sw, xsltText.OutputSettings))
    {
        xsltText.Transform(doc, xwo);
        output = sw.ToString();
    }

    // PrintJson(output);
}
```

## Conclusion

This article provides with the basic details on how we can map and takes into account the performance only at the mapping level and not the setup part of it. This is intended to explain and explore the available ways to map and how they might perform, but overall I am trying to encourage to explore the how and why to choose a tech stack to be dependent on a data-based decision rather than just like that! Happy and performant coding!
