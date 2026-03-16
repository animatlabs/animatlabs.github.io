# AnimatLabs

[![Website](https://img.shields.io/badge/Website-animatlabs.com-blue)](https://animatlabs.com)
[![RSS Feed](https://img.shields.io/badge/RSS-Feed-orange)](https://animatlabs.com/feed.xml)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A technical blog focused on .NET, C#, software architecture, and best practices.

## About

<img src="https://raw.githubusercontent.com/animatlabs/animatlabs.github.io/main/assets/images/logo_300x300.png" alt="AnimatLabs logo" width="120" align="right"/>

**AnimatLabs** is a shared playground for the developer community, featuring articles on:

- .NET and C# development
- Entity Framework Core
- Software architecture and design patterns
- Performance optimization
- Security best practices
- Developer tools and workflows

Visit [animatlabs.com](https://animatlabs.com) to explore all posts.

## Subscribe

Stay updated with new posts:

- **RSS Feed**: [animatlabs.com/feed.xml](https://animatlabs.com/feed.xml)
- **Subscribe Page**: [animatlabs.com/subscribe](https://animatlabs.com/subscribe/)

## Local Development

This site is built with [Jekyll](https://jekyllrb.com/) and the [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/) theme.

### Using Docker (no Ruby required)

```bash
docker run --rm -v "${PWD}:/srv/jekyll" -p 4000:4000 jekyll/jekyll:4 jekyll serve --host 0.0.0.0 --force_polling
```

Site will be available at `http://localhost:4000`. The container installs gems automatically on first run.

### Using Ruby

```bash
bundle install                 # install dependencies
bundle exec jekyll serve       # http://localhost:4000
bundle exec jekyll build       # production build
```

## Author

**Animesh Agarwal** - Principal Software Engineer at Autodesk

- [LinkedIn](https://linkedin.com/in/089ani)
- [GitHub](https://github.com/animat089)
- [StackOverflow](https://stackoverflow.com/users/2822615/animat089)
- [Email](mailto:animesh@animatlabs.com)

## License

Content is copyright of Animesh Agarwal. The site theme is MIT licensed.
